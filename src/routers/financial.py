import uuid
from dataclasses import dataclass
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from models import QuoteRequest, RedeemBody, StorePayoutMethod, StorePayoutBody, WalletBalanceUSDRequest
from core.xrpl import (
    get_quote,
    offramp_via_faucet,
    derive_address_from_public_key,
    fetch_xrp_balance_drops,
    xrp_drops_to_usd,
    usd_to_xrp_drops,
)
from core.database import TBL_RECIPIENTS, TBL_PAYOUTS, TBL_STORE_METHODS, TBL_MOVES
from core.utils import now_iso

router = APIRouter()


@dataclass
class RecipientWallet:
    ngo_id: str
    address: str
    seed: str


def _fetch_recipient(recipient_id: str) -> Dict[str, Any]:
    recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    return recipient


def _resolve_wallet(recipient: Dict[str, Any]) -> RecipientWallet:
    public_key = recipient.get("public_key")
    seed = recipient.get("seed")
    address = recipient.get("address")
    if not public_key or not seed:
        raise HTTPException(400, "Recipient wallet not properly configured")
    resolved_address = address or derive_address_from_public_key(public_key)
    if not resolved_address:
        raise HTTPException(400, "Cannot derive recipient address from public key")
    ngo_id = recipient.get("ngo_id")
    if not ngo_id:
        raise HTTPException(400, "Recipient missing NGO linkage")
    return RecipientWallet(ngo_id=str(ngo_id), address=resolved_address, seed=seed)


def _amount_minor_to_usd(amount_minor: int) -> float:
    return amount_minor / 100.0


def _ensure_wallet_balance(address: str, amount_usd: float) -> float:
    balance_drops = fetch_xrp_balance_drops(address)
    if balance_drops is None:
        raise HTTPException(500, "Unable to check recipient wallet balance")
    balance_usd = xrp_drops_to_usd(balance_drops)
    if balance_usd < amount_usd:
        raise HTTPException(
            400,
            f"Insufficient XRPL wallet balance. Available: ${balance_usd:.2f}, Required: ${amount_usd:.2f}",
        )
    return balance_usd


def _offramp_recipient(wallet: RecipientWallet, body: RedeemBody, amount_usd: float) -> str:
    memos = {"Redeem": body.voucher_id, "Store": body.store_id, "Program": body.program_id}
    return offramp_via_faucet(wallet.seed, wallet.address, amount_usd, memos=memos)


def _persist_payout(
    *,
    store_id: str,
    program_id: str,
    amount_minor: int,
    currency: str,
    quote_id: str,
    tx_hash: str,
    status: str,
    ngo_id: str | None = None,
) -> str:
    store_id = str(uuid.uuid4())
    payout_id = str(uuid.uuid4())

    record: Dict[str, Any] = {
        "payout_id": payout_id,
        "store_id": store_id,
        "program_id": program_id,
        "amount_minor": amount_minor,
        "currency": currency,
        "quote_id": quote_id,
        "xrpl_tx_hash": tx_hash,
        "offramp_ref": None,
        "status": status,
    }
    if ngo_id:
        record["ngo_id"] = ngo_id
    TBL_PAYOUTS.put_item(Item=record)
    return payout_id


def _record_move(wallet: RecipientWallet, tx_hash: str, amount_usd: float, body: RedeemBody) -> None:
    memos = {"voucher_id": body.voucher_id, "store_id": body.store_id, "program_id": body.program_id}
    TBL_MOVES.put_item(
        Item={
            "tx_hash": tx_hash,
            "classic_address": wallet.address,
            "direction": "out",
            "delivered_currency": "XRP",
            "delivered_minor": usd_to_xrp_drops(amount_usd),
            "memos": memos,
            "validated_ledger": 0,
            "ngo_id": wallet.ngo_id,
        }
    )


@router.post("/quotes", tags=["quotes"])
def create_quote(body: QuoteRequest):
    return get_quote(body.from_currency, body.to_currency, body.amount_minor)


@router.post("/redeem", tags=["redeem"])
def redeem(body: RedeemBody):
    recipient = _fetch_recipient(body.recipient_id)
    wallet = _resolve_wallet(recipient)
    amount_usd = _amount_minor_to_usd(body.amount_minor)
    available_balance = _ensure_wallet_balance(wallet.address, amount_usd)

    tx_hash = _offramp_recipient(wallet, body, amount_usd)
    quote = get_quote("XRP", body.currency, body.amount_minor)
    payout_id = _persist_payout(
        store_id=body.store_id,
        program_id=body.program_id,
        amount_minor=body.amount_minor,
        currency=body.currency,
        quote_id=quote["quote_id"],
        tx_hash=tx_hash,
        status="paid",
        ngo_id=wallet.ngo_id,
    )
    _record_move(wallet, tx_hash, amount_usd, body)

    return {
        "payout_id": payout_id,
        "store_currency": body.currency,
        "amount_minor": body.amount_minor,
        "quote": quote,
        "xrpl_tx_hash": tx_hash,
        "status": "completed",
        "recipient_address": wallet.address,
        "amount_transferred_usd": amount_usd,
        "wallet_balance_usd": available_balance,
    }


@router.put("/stores/{store_id}/payout-method", tags=["stores"])
def upsert_store_payout_method(store_id: str, body: StorePayoutMethod):
    TBL_STORE_METHODS.put_item(Item={"store_id": store_id, "method": body.method, "currency": body.currency, "detail": body.detail, "updated_at": now_iso()})
    return {"ok": True}


@router.post("/payouts", tags=["payouts"])
def create_payout(body: StorePayoutBody):
    quote = get_quote("XRP", body.currency, body.amount_minor)
    tx_hash = "simulated-tx-hash-for-dev-only"
    payout_id = _persist_payout(
        store_id=body.store_id,
        program_id=body.program_id,
        amount_minor=body.amount_minor,
        currency=body.currency,
        quote_id=quote["quote_id"],
        tx_hash=tx_hash,
        status="processing",
    )
    return {"payout_id": payout_id, "xrpl_tx_hash": tx_hash, "status": "processing"}


@router.get("/stores/{store_id}/payouts", tags=["stores"])
def list_store_payouts(store_id: str):
    res = TBL_PAYOUTS.scan()
    items = [p for p in res.get("Items", []) if p.get("store_id") == store_id]
    return {"items": items}


@router.post("/wallets/balance-usd", tags=["wallets"]) 
def wallet_balance_usd(body: WalletBalanceUSDRequest):
    """Return wallet balance in USD from a given XRPL public key.
    Dev-safe: if XRPL is unavailable or account unfunded, returns balance_usd = 0.
    """
    # Handle demo public key case    
    addr = derive_address_from_public_key(body.public_key)
    if not addr:
        # Cannot derive address from public key
        return {"address": None, "balance_drops": 0, "balance_usd": 0.0}
    drops = fetch_xrp_balance_drops(addr)
    if drops is None:
        return {"address": addr, "balance_drops": 0, "balance_usd": 0.0}
    usd = xrp_drops_to_usd(drops)
    return {"address": addr, "balance_drops": drops, "balance_usd": usd}
