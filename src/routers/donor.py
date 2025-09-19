from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

import requests
import stripe
from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field

from core.config import (
    OPENAI_API_KEY,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    XRPL_FALLBACK_ADDRESS,
)
from core.database import TBL_ACCOUNTS, TBL_PROGRAMS
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
                classic, _ = xaddress_to_classic_address(addr)
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


def _account_address_from_id(account_id: str) -> Optional[str]:
    try:
        account = TBL_ACCOUNTS.get_item(Key={"account_id": account_id}).get("Item")
        if account:
            for key in ("address", "xrpl_address", "public_key"):
                cand = _normalize_address(account.get(key))
                if cand:
                    return cand
    except Exception as exc:  # pragma: no cover - logged for debugging
        logger.debug("Account lookup failed for %s: %s", account_id, exc)
    try:
        resp = TBL_ACCOUNTS.scan(
            FilterExpression="account_id = :aid",
            ExpressionAttributeValues={":aid": account_id},
        )
        for item in resp.get("Items", []):
            for key in ("address", "xrpl_address", "public_key"):
                cand = _normalize_address(item.get(key))
                if cand:
                    return cand
    except Exception as exc:  # pragma: no cover
        logger.debug("Account scan failed for %s: %s", account_id, exc)
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
    return {
        "ok": True,
        "txHash": result.get("tx_hash"),
        "engine_result": result.get("engine_result"),
        "via": result.get("via"),
        "toAddress": destination,
        "donationId": str(uuid.uuid4()),
    }
