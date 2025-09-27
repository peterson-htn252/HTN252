from __future__ import annotations

import logging
import re
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import requests
import stripe
from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field

try:  # pydantic v2
    from pydantic import ConfigDict
    PYDANTIC_V2 = True
except Exception:  # pragma: no cover - fallback for pydantic v1
    ConfigDict = None  # type: ignore
    PYDANTIC_V2 = False

from core.config import (
    OPENAI_API_KEY,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    XRPL_FALLBACK_ADDRESS,
    XRPL_USD_RATE,
)
from core.database import TBL_ACCOUNTS, TBL_PROGRAMS, TBL_PAYOUTS, TBL_RECIPIENTS, TBL_MOVES, supabase
from core.xrpl import derive_address_from_public_key, onramp_via_faucet, wallet_to_wallet_send

try:  # xrpl address helpers are optional in some environments
    from xrpl.core.addresscodec import (
        is_valid_classic_address,
        is_valid_xaddress,
        xaddress_to_classic_address,
    )
except Exception:  # pragma: no cover - fall back to simple heuristics
    is_valid_classic_address = None  # type: ignore
    is_valid_xaddress = None  # type: ignore
    xaddress_to_classic_address = None  # type: ignore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/donor", tags=["donor"])


class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1)


class StripePaymentRequest(BaseModel):
    amount: int = Field(..., ge=1, description="Donation amount in cents")
    currency: str = Field("usd", min_length=1)
    programId: str = Field(..., min_length=1)
    email: EmailStr
    ngoPublicKey: str = Field(..., min_length=1)


class FulfillRequest(BaseModel):
    paymentIntentId: str = Field(..., min_length=1)
    programId: Optional[str] = None
    overrideAddress: Optional[str] = None


class SendDevRequest(BaseModel):
    to: str = Field(..., min_length=1)
    amountXrp: float = Field(..., gt=0)
    programId: Optional[str] = None


class TrackingTransaction(BaseModel):
    id: str
    hash: str
    type: str
    amount: float
    currency: str
    timestamp: Optional[str]
    status: str
    sender: str = Field(..., alias="from")
    recipient: str = Field(..., alias="to")
    description: str
    gasUsed: Optional[int] = None
    blockNumber: Optional[int] = None

    if PYDANTIC_V2:  # pragma: no cover - handled at import time
        model_config = ConfigDict(populate_by_name=True)  # type: ignore[assignment]
    else:
        class Config:  # pragma: no cover - pydantic v1 support
            allow_population_by_field_name = True


class RecipientShare(BaseModel):
    id: str
    location: str
    amount: float
    status: str
    redeemedAt: Optional[str] = None

    if PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)  # type: ignore[assignment]
    else:
        class Config:  # pragma: no cover - pydantic v1 support
            allow_population_by_field_name = True


class NGOCostBreakdown(BaseModel):
    category: str
    amount: float
    description: str

    if PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)  # type: ignore[assignment]
    else:
        class Config:  # pragma: no cover - pydantic v1 support
            allow_population_by_field_name = True


class NGOCosts(BaseModel):
    amount: float
    percentage: float
    breakdown: List[NGOCostBreakdown]

    if PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)  # type: ignore[assignment]
    else:
        class Config:  # pragma: no cover
            allow_population_by_field_name = True


class DonationTrackingResponse(BaseModel):
    donationId: str
    blockchainId: str
    amount: float
    currency: str
    program: str
    donor: str
    status: str
    ngoId: Optional[str]
    ngoName: Optional[str]
    transactions: List[TrackingTransaction]
    recipients: List[RecipientShare]
    ngoOperationalCosts: NGOCosts

    if PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)  # type: ignore[assignment]
    else:
        class Config:  # pragma: no cover
            allow_population_by_field_name = True


def _stripe_to_dict(obj: Any) -> Dict[str, Any]:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "to_dict"):
        return obj.to_dict()  # type: ignore[no-any-return]
    try:
        return dict(obj)
    except Exception:
        return {}


def _coerce_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _normalize_address(candidate: Optional[str]) -> Optional[str]:
    if not candidate:
        return None
    addr = candidate.strip()
    if not addr:
        return None
    try:
        if is_valid_classic_address and is_valid_classic_address(addr):  # type: ignore[operator]
            return addr
    except Exception:
        pass
    if is_valid_xaddress and xaddress_to_classic_address:  # type: ignore[truthy-func]
        try:
            if is_valid_xaddress(addr):  # type: ignore[operator]
                classic, _, _t = xaddress_to_classic_address(addr)
                return classic
        except Exception:
            pass
    if re.fullmatch(r"[A-Fa-f0-9]{66}|[A-Fa-f0-9]{130}", addr):
        derived = derive_address_from_public_key(addr)
        if derived:
            return derived
    if addr.startswith("r"):
        return addr
    return None


def _account_address_from_id(ngo_id: str) -> Optional[str]:
    try:
        account = TBL_ACCOUNTS.get_item(Key={"ngo_id": ngo_id}).get("Item")
        if account:
            for key in ("address", "xrpl_address", "public_key"):
                cand = _normalize_address(account.get(key))
                if cand:
                    return cand
    except Exception as exc:  # pragma: no cover - logged for debugging
        logger.debug("Account lookup failed for %s: %s", ngo_id, exc)
    try:
        resp = TBL_ACCOUNTS.scan(
            FilterExpression="ngo_id = :aid",
            ExpressionAttributeValues={":aid": ngo_id},
        )
        for item in resp.get("Items", []):
            for key in ("address", "xrpl_address", "public_key"):
                cand = _normalize_address(item.get(key))
                if cand:
                    return cand
    except Exception as exc:  # pragma: no cover
        logger.debug("Account scan failed for %s: %s", ngo_id, exc)
    return None


def _lookup_account_address(program_id: str) -> Optional[str]:
    try:
        program = TBL_PROGRAMS.get_item(Key={"program_id": program_id}).get("Item")
    except Exception as exc:  # pragma: no cover
        logger.debug("Program lookup failed for %s: %s", program_id, exc)
        program = None
    if program:
        ngo_id = str(program.get("ngo_id")) if program.get("ngo_id") else None
        if ngo_id:
            addr = _account_address_from_id(ngo_id)
            if addr:
                return addr
    return _account_address_from_id(program_id)


def _drops_to_usd(drops: Optional[int]) -> float:
    if not drops:
        return 0.0
    try:
        value = Decimal(str(drops)) / Decimal("1000000")
        usd = value * Decimal(str(XRPL_USD_RATE))
        return float(usd.quantize(Decimal("0.01")))
    except Exception:
        return 0.0


def _amount_minor_to_usd(amount_minor: Optional[int]) -> float:
    if not amount_minor:
        return 0.0
    try:
        return float((Decimal(str(amount_minor)) / Decimal("100")).quantize(Decimal("0.01")))
    except Exception:
        return 0.0


def _safe_percentage(part: float, total: float) -> float:
    if total <= 0:
        return 0.0
    return round((part / total) * 100, 2)


def _safe_get(table, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        return table.get_item(Key=key).get("Item")  # type: ignore[return-value]
    except Exception:
        return None


def _load_transactions(ngo_id: Optional[str], program_id: Optional[str], tx_hash: Optional[str]) -> List[TrackingTransaction]:
    if not ngo_id:
        return []

    try:
        query = supabase.table(TBL_MOVES.name).select(
            "tx_hash,delivered_currency,delivered_minor,occurred_at,direction,classic_address,memos,validated_ledger"
        ).eq("ngo_id", ngo_id)
        if tx_hash:
            query = query.eq("tx_hash", tx_hash)
        rows = query.order("occurred_at", desc=True).limit(10).execute().data or []
    except Exception:
        rows = []

    if program_id:
        filtered = []
        for row in rows:
            memo = row.get("memos") or {}
            if memo.get("program_id") == program_id:
                filtered.append(row)
        if filtered:
            rows = filtered

    transactions: List[TrackingTransaction] = []
    for idx, row in enumerate(rows):
        memo = row.get("memos") or {}
        event_type = memo.get("voucher_id") and "redemption" or "distribution"
        if row.get("direction") == "in":
            event_type = "donation"
        amount_usd = _drops_to_usd(row.get("delivered_minor"))
        description_parts = []
        if memo.get("voucher_id"):
            description_parts.append(f"Voucher {memo['voucher_id']}")
        if memo.get("store_id"):
            description_parts.append(f"Store {memo['store_id']}")
        if memo.get("program_id"):
            description_parts.append(f"Program {memo['program_id']}")
        description = ", ".join(description_parts) or "XRPL movement"
        status = "confirmed" if (row.get("validated_ledger") or 0) >= 0 else "pending"
        transactions.append(
            TrackingTransaction(
                id=str(idx + 1),
                hash=row.get("tx_hash", ""),
                type=event_type,
                amount=amount_usd,
                currency="USD",
                timestamp=row.get("occurred_at"),
                status=status,
                sender=row.get("classic_address") or "XRPL",
                recipient=memo.get("store_id") or memo.get("program_id") or "Beneficiary Network",
                description=description,
                blockNumber=row.get("validated_ledger"),
            )
        )
    return transactions


def _load_recipients(ngo_id: Optional[str], total_amount: float) -> List[RecipientShare]:
    if not ngo_id:
        return []

    try:
        res = (
            supabase.table(TBL_RECIPIENTS.name)
            .select("recipient_id,location,balance,updated_at,name")
            .eq("ngo_id", ngo_id)
            .limit(10)
            .execute()
        )
        rows = res.data or []
    except Exception:
        rows = []

    if not rows:
        return []

    count = len(rows)
    share = round(total_amount / count, 2) if total_amount > 0 else 0.0
    recipients: List[RecipientShare] = []
    for row in rows:
        balance = float(row.get("balance") or 0.0)
        status = "pending"
        if balance <= 0:
            status = "redeemed"
        elif balance < share or share == 0:
            status = "received"
        recipients.append(
            RecipientShare(
                id=str(row.get("recipient_id")),
                location=row.get("location") or "Unknown",
                amount=share or round(balance, 2),
                status=status,
                redeemedAt=row.get("updated_at"),
            )
        )
    return recipients


def _build_operational_costs(total_amount: float) -> NGOCosts:
    if total_amount <= 0:
        return NGOCosts(amount=0.0, percentage=0.0, breakdown=[])

    operational_amount = round(total_amount * 0.05, 2)
    if operational_amount <= 0:
        operational_amount = round(total_amount * 0.03, 2)

    weights = [0.45, 0.35, 0.20]
    categories = [
        ("Transaction Fees", "Blockchain transaction costs and network gas fees"),
        ("Platform Operations", "System maintenance, monitoring, and fraud prevention"),
        ("Verification & Audit", "Third-party verification and compliance reporting"),
    ]

    breakdown: List[NGOCostBreakdown] = []
    remaining = operational_amount
    for index, ((label, desc), weight) in enumerate(zip(categories, weights)):
        if index == len(categories) - 1:
            amount = round(remaining, 2)
        else:
            amount = round(operational_amount * weight, 2)
            remaining = round(remaining - amount, 2)
        breakdown.append(NGOCostBreakdown(category=label, amount=amount, description=desc))

    percentage = _safe_percentage(operational_amount, total_amount)
    return NGOCosts(amount=operational_amount, percentage=percentage, breakdown=breakdown)


@router.get("/track", tags=["donor"])
def list_tracking_samples(limit: int = Query(5, ge=1, le=20)) -> Dict[str, List[Dict[str, Any]]]:
    """Return a small set of recent payout or transaction IDs donors can use for tracking."""

    samples: List[Dict[str, Any]] = []

    try:
        payout_rows = (
            supabase.table(TBL_PAYOUTS.name)
            .select("payout_id,xrpl_tx_hash,ngo_id,amount_minor,currency,created_at,status")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
    except Exception:
        payout_rows = []

    for row in payout_rows:
        samples.append(
            {
                "donationId": row.get("payout_id"),
                "blockchainId": row.get("xrpl_tx_hash"),
                "ngoId": row.get("ngo_id"),
                "amount": _amount_minor_to_usd(row.get("amount_minor")),
                "currency": row.get("currency", "USD"),
                "status": row.get("status"),
                "created_at": row.get("created_at"),
            }
        )

    if not samples:
        try:
            move_rows = (
                supabase.table(TBL_MOVES.name)
                .select("tx_hash,ngo_id,delivered_minor,occurred_at")
                .order("occurred_at", desc=True)
                .limit(limit)
                .execute()
            ).data or []
        except Exception:
            move_rows = []

        for row in move_rows:
            samples.append(
                {
                    "donationId": f"TX-{str(row.get('tx_hash', ''))[:12]}",
                    "blockchainId": row.get("tx_hash"),
                    "ngoId": row.get("ngo_id"),
                    "amount": _drops_to_usd(row.get("delivered_minor")),
                    "currency": "USD",
                    "status": "confirmed",
                    "created_at": row.get("occurred_at"),
                }
            )

    return {"samples": samples[:limit]}


@router.get("/track/{tracking_id}", tags=["donor"], response_model=DonationTrackingResponse)
def get_donation_tracking(tracking_id: str) -> DonationTrackingResponse:
    """Resolve a donor-facing tracking ID into detailed blockchain movement data."""

    tracking_id = tracking_id.strip()
    if not tracking_id:
        raise HTTPException(status_code=400, detail="Tracking ID is required")

    tracking_upper = tracking_id.upper()

    payout = _safe_get(TBL_PAYOUTS, {"payout_id": tracking_id})
    if not payout:
        payout = _safe_get(TBL_PAYOUTS, {"xrpl_tx_hash": tracking_upper})

    movement_row: Optional[Dict[str, Any]] = None
    if not payout:
        try:
            move_res = (
                supabase.table(TBL_MOVES.name)
                .select("tx_hash,ngo_id,memos,delivered_minor,occurred_at,validated_ledger,classic_address")
                .eq("tx_hash", tracking_upper)
                .limit(1)
                .execute()
            )
            move_data = move_res.data or []
            movement_row = move_data[0] if move_data else None
        except Exception:
            movement_row = None

    if not payout and not movement_row:
        raise HTTPException(status_code=404, detail="Tracking ID not found")

    ngo_id = payout.get("ngo_id") if payout else movement_row.get("ngo_id") if movement_row else None
    program_id = None
    if payout:
        program_id = payout.get("program_id")
    elif movement_row:
        program_id = (movement_row.get("memos") or {}).get("program_id")

    tx_hash = None
    if payout and payout.get("xrpl_tx_hash"):
        tx_hash = payout["xrpl_tx_hash"]
    elif movement_row and movement_row.get("tx_hash"):
        tx_hash = movement_row["tx_hash"]

    transactions = _load_transactions(ngo_id, program_id, tx_hash)

    if not transactions and payout:
        amount = _amount_minor_to_usd(payout.get("amount_minor"))
        transactions = [
            TrackingTransaction(
                id="1",
                hash=payout.get("xrpl_tx_hash") or payout.get("payout_id") or tracking_upper,
                type="distribution",
                amount=amount,
                currency=payout.get("currency", "USD"),
                timestamp=payout.get("created_at"),
                status="confirmed" if str(payout.get("status", "")).lower() == "paid" else "pending",
                sender="NGO",
                recipient=payout.get("store_id") or "Aid Distribution",
                description=f"Payout {payout.get('payout_id')} processed",
            )
        ]

    amount = _amount_minor_to_usd(payout.get("amount_minor")) if payout else 0.0
    if amount <= 0 and transactions:
        amount = round(sum(tx.amount for tx in transactions), 2)

    currency = payout.get("currency", "USD") if payout else "USD"

    ngo_account = _safe_get(TBL_ACCOUNTS, {"ngo_id": ngo_id}) if ngo_id else None
    ngo_name = ngo_account.get("name") if ngo_account else None

    program_name = program_id or "General Aid Program"
    if program_id:
        program = _safe_get(TBL_PROGRAMS, {"program_id": program_id})
        if program and program.get("name"):
            program_name = program["name"]

    status_map = {"paid": "distributed", "processing": "processing", "pending": "received"}
    raw_status = (payout.get("status") if payout else "paid") or "paid"
    status_label = status_map.get(str(raw_status).lower(), "distributed")

    recipients = _load_recipients(ngo_id, amount)
    costs = _build_operational_costs(amount)

    donation_id = payout.get("payout_id") if payout else (movement_row.get("tx_hash") if movement_row else f"TRACK-{tracking_upper[:10]}")
    blockchain_id = tx_hash or tracking_upper

    response = DonationTrackingResponse(
        donationId=str(donation_id),
        blockchainId=str(blockchain_id),
        amount=round(amount, 2),
        currency=currency,
        program=program_name,
        donor="Anonymous Donor",
        status=status_label,
        ngoId=ngo_id,
        ngoName=ngo_name,
        transactions=transactions,
        recipients=recipients,
        ngoOperationalCosts=costs,
    )

    if hasattr(response, "model_dump"):
        return response.model_dump(by_alias=True)  # type: ignore[attr-defined]
    return response.dict(by_alias=True)  # type: ignore[no-any-return]


def _resolve_destination(
    program_id: Optional[str],
    override: Optional[str],
    metadata: Dict[str, Any],
) -> Tuple[str, Optional[str]]:
    candidates: List[Optional[str]] = [override]
    if program_id:
        candidates.append(_lookup_account_address(program_id))
    if metadata:
        candidates.append(metadata.get("ngoAddress"))
        candidates.append(metadata.get("ngoPublicKey"))
    candidates.append(XRPL_FALLBACK_ADDRESS)

    for raw in candidates:
        addr = _normalize_address(raw if isinstance(raw, str) else None)
        if addr:
            return addr, raw if isinstance(raw, str) else None

    raise HTTPException(
        status_code=400,
        detail=(
            "No valid XRPL destination (set overrideAddress, store an address in the"
            " database, or configure XRPL_HARDCODED_ADDRESS)."
        ),
    )


@router.get("/programs")
def list_programs(status: str = Query("active")) -> Dict[str, List[Dict[str, Any]]]:
    """Expose donor programs backed by the Supabase table."""

    scan_kwargs: Dict[str, Any] = {}
    if status:
        scan_kwargs = {
            "FilterExpression": "#s = :status",
            "ExpressionAttributeNames": {"#s": "status"},
            "ExpressionAttributeValues": {":status": status},
        }

    try:
        resp = TBL_PROGRAMS.scan(**scan_kwargs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch programs: {exc}") from exc

    programs: List[Dict[str, Any]] = []
    for item in resp.get("Items", []):
        program_id = str(
            item.get("program_id")
            or item.get("programId")
            or item.get("id")
            or item.get("ngo_id")
            or ""
        )
        programs.append(
            {
                "programId": program_id,
                "name": item.get("name", ""),
                "description": item.get("description"),
                "status": str(item.get("status", "")),
                "currency": (item.get("currency") or "USD").upper(),
                "goalAmount": _coerce_number(item.get("goal_amount") or item.get("goal")),
                "raisedAmount": _coerce_number(
                    item.get("raised_amount")
                    or item.get("raisedAmount")
                    or item.get("lifetime_donations")
                ),
                "location": item.get("location"),
                "ngoId": item.get("ngo_id"),
                "xrplIssuer": item.get("xrpl_issuer") or item.get("issuer"),
            }
        )

    return {"programs": programs}


@router.post("/summarize")
def summarize_description(payload: SummarizeRequest) -> Dict[str, str]:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    body = {
        "model": "gpt-3.5-turbo",
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant that summarizes NGO descriptions for donors.",
            },
            {
                "role": "user",
                "content": f"Summarize the following NGO description in two sentences:\n{payload.text}",
            },
        ],
        "temperature": 0.7,
        "max_tokens": 100,
    }

    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=30,
        )
    except requests.RequestException as exc:
        logger.exception("OpenAI request failed")
        raise HTTPException(status_code=500, detail="AI request failed") from exc

    if resp.status_code >= 400:
        logger.error("OpenAI error %s: %s", resp.status_code, resp.text)
        raise HTTPException(status_code=500, detail="AI request failed")

    data = resp.json()
    summary = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )
    return {"summary": summary}


@router.post("/payments/stripe")
def create_payment_intent(payload: StripePaymentRequest) -> Dict[str, str]:
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    if payload.amount < 50:
        raise HTTPException(status_code=400, detail="Invalid amount (cents) supplied")
    if not payload.ngoPublicKey.strip():
        raise HTTPException(status_code=400, detail="Missing ngoPublicKey (XRPL address)")

    try:
        stripe.api_key = STRIPE_SECRET_KEY
        intent = stripe.PaymentIntent.create(
            amount=payload.amount,
            currency=payload.currency.lower(),
            receipt_email=payload.email,
            automatic_payment_methods={"enabled": True},
            metadata={
                "programId": payload.programId,
                "email": payload.email,
                "ngoPublicKey": payload.ngoPublicKey,
            },
        )
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.error("[PI:create] error %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    client_secret = getattr(intent, "client_secret", None)
    if not client_secret:
        raise HTTPException(status_code=500, detail="No client secret from Stripe")

    return {"clientSecret": client_secret, "paymentIntentId": intent.id}


@router.post("/payments/fulfill")
def fulfill_payment(payload: FulfillRequest) -> Dict[str, Any]:
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    try:
        stripe.api_key = STRIPE_SECRET_KEY
        intent = stripe.PaymentIntent.retrieve(payload.paymentIntentId)
    except stripe.error.StripeError as exc:  # type: ignore[attr-defined]
        logger.error("[fulfill] retrieve failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    status_value = getattr(intent, "status", None)
    if status_value != "succeeded":
        raise HTTPException(
            status_code=400,
            detail=f"PaymentIntent not succeeded (status={status_value})",
        )

    metadata = _stripe_to_dict(getattr(intent, "metadata", {}))
    program_id = payload.programId or metadata.get("programId")
    if not program_id:
        raise HTTPException(status_code=400, detail="No programId found (metadata or body)")

    destination, raw_used = _resolve_destination(program_id, payload.overrideAddress, metadata)
    amount_cents = getattr(intent, "amount_received", None) or getattr(intent, "amount", 0) or 0
    amount_usd = amount_cents / 100.0

    logger.info(
        "[fulfill] programId=%s dest=%s amountXrp=%.6f raw=%s",
        program_id,
        destination,
        amount_usd,
        raw_used,
    )

    tx_hash = onramp_via_faucet(
        destination,
        amount_usd,
        memos={
            "Program": program_id,
            "DonationId": payload.paymentIntentId,
        },
    )

    # Best-effort lifetime donations update for the program's NGO
    try:
        program_record = _safe_get(TBL_PROGRAMS, {"program_id": program_id})
        ngo_id = None
        if program_record:
            ngo_id = program_record.get("ngo_id") or program_record.get("ngoId") or program_id
        else:
            ngo_id = metadata.get("ngoId") or program_id
        _increment_lifetime_donations(ngo_id, amount_usd)
    except Exception as exc:  # pragma: no cover - non fatal
        logger.warning("Failed to update lifetime donations for program %s: %s", program_id, exc)

    return {
        "ok": True,
        "txHash": tx_hash,
        "toAddress": destination,
        "programId": program_id,
        "donationId": payload.paymentIntentId,
    }


@router.post("/xrpl/send-dev")
def send_dev_payment(payload: SendDevRequest) -> Dict[str, Any]:
    destination = _normalize_address(payload.to)
    if not destination:
        raise HTTPException(status_code=400, detail="Invalid 'to' address (must be XRPL classic)")

    sender_address = ""
    sender_seed = ""
    result = wallet_to_wallet_send(sender_seed, sender_address, destination, payload.amountXrp)

    try:
        ngo_id = payload.programId or destination
        _increment_lifetime_donations(ngo_id, round(float(payload.amountXrp), 2))
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to update lifetime donations after XRPL payment: %s", exc)

    return {
        "ok": True,
        "txHash": result.get("tx_hash"),
        "engine_result": result.get("engine_result"),
        "via": result.get("via"),
        "toAddress": destination,
        "donationId": str(uuid.uuid4()),
    }
def _increment_lifetime_donations(ngo_id: Optional[str], amount: float) -> None:
    if not ngo_id or amount <= 0:
        return

    try:
        account_record = _safe_get(TBL_ACCOUNTS, {"ngo_id": ngo_id})
        current_total = account_record.get("lifetime_donations", 0) if account_record else 0
        try:
            current_total_float = float(current_total)
        except (TypeError, ValueError):
            current_total_float = 0.0

        updated_total = round(current_total_float + amount, 2)
        supabase.table(TBL_ACCOUNTS.name).update({"lifetime_donations": updated_total}).eq("ngo_id", ngo_id).execute()
    except Exception as exc:  # pragma: no cover - logging only
        logger.warning("Failed to increment lifetime donations for NGO %s: %s", ngo_id, exc)
