import uuid
from fastapi import APIRouter, HTTPException

from models import QuoteRequest, RedeemBody, StorePayoutMethod, StorePayoutBody, WalletBalanceUSDRequest
from core.xrpl import (
    get_quote,
    pay_offramp_on_xrpl,
    to_drops,
    derive_address_from_public_key,
    fetch_xrp_balance_drops,
    convert_drops_to_usd,
)
from core.database import TBL_RECIPIENTS, TBL_PAYOUTS, TBL_STORE_METHODS, TBL_MOVES
from core.config import NGO_HOT_ADDRESS
from core.utils import now_iso

router = APIRouter()


@router.post("/quotes", tags=["quotes"])
def create_quote(body: QuoteRequest):
    return get_quote(body.from_currency, body.to_currency, body.amount_minor)


@router.post("/redeem", tags=["redeem"])
def redeem(body: RedeemBody):
    # Get recipient and check balance
    recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": body.recipient_id}).get("Item")
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    
    current_balance = recipient.get("balance", 0.0)
    amount_major = body.amount_minor / 100.0  # Convert minor units to major units
    
    if current_balance < amount_major:
        raise HTTPException(400, "Insufficient balance")
    
    quote = get_quote("XRP", body.currency, body.amount_minor)
    memos = {"voucher_id": body.voucher_id, "store_id": body.store_id, "program_id": body.program_id}
    tx_hash = pay_offramp_on_xrpl(to_drops(body.amount_minor), memos)
    payout_id = str(uuid.uuid4())
    TBL_PAYOUTS.put_item(Item={
        "payout_id": payout_id,
        "store_id": body.store_id,
        "program_id": body.program_id,
        "amount_minor": body.amount_minor,
        "currency": body.currency,
        "quote_id": quote["quote_id"],
        "xrpl_tx_hash": tx_hash,
        "offramp_ref": None,
        "status": "processing",
        "created_at": now_iso(),
    })
    
    # Update recipient balance
    new_balance = current_balance - amount_major
    TBL_RECIPIENTS.update_item(
        Key={"recipient_id": body.recipient_id},
        UpdateExpression="SET balance = :balance",
        ExpressionAttributeValues={":balance": new_balance},
    )
    if tx_hash:
        TBL_MOVES.put_item(Item={
            "tx_hash": tx_hash,
            "classic_address": (NGO_HOT_ADDRESS or "ngo_hot_unknown"),
            "direction": "out",
            "delivered_currency": "XRP",
            "delivered_minor": to_drops(body.amount_minor),
            "memos": memos,
            "validated_ledger": 0,
            "occurred_at": now_iso(),
        })
    return {
        "payout_id": payout_id,
        "store_currency": body.currency,
        "amount_minor": body.amount_minor,
        "quote": quote,
        "xrpl_tx_hash": tx_hash,
        "status": "processing",
    }


@router.put("/stores/{store_id}/payout-method", tags=["stores"])
def upsert_store_payout_method(store_id: str, body: StorePayoutMethod):
    TBL_STORE_METHODS.put_item(Item={"store_id": store_id, "method": body.method, "currency": body.currency, "detail": body.detail, "updated_at": now_iso()})
    return {"ok": True}


@router.post("/payouts", tags=["payouts"])
def create_payout(body: StorePayoutBody):
    quote = get_quote("XRP", body.currency, body.amount_minor)
    memos = {"voucher_id": "batch", "store_id": body.store_id, "program_id": body.program_id}
    tx_hash = pay_offramp_on_xrpl(to_drops(body.amount_minor), memos)
    payout_id = str(uuid.uuid4())
    TBL_PAYOUTS.put_item(Item={
        "payout_id": payout_id,
        "store_id": body.store_id,
        "program_id": body.program_id,
        "amount_minor": body.amount_minor,
        "currency": body.currency,
        "quote_id": quote["quote_id"],
        "xrpl_tx_hash": tx_hash,
        "offramp_ref": None,
        "status": "processing",
        "created_at": now_iso(),
    })
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
    addr = derive_address_from_public_key(body.public_key)
    if not addr:
        # Cannot derive address from public key
        return {"address": None, "balance_drops": 0, "balance_usd": 0.0}
    drops = fetch_xrp_balance_drops(addr)
    if drops is None:
        return {"address": addr, "balance_drops": 0, "balance_usd": 0.0}
    usd = convert_drops_to_usd(drops)
    return {"address": addr, "balance_drops": drops, "balance_usd": usd}
