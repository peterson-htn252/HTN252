import uuid
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


@router.post("/quotes", tags=["quotes"])
def create_quote(body: QuoteRequest):
    return get_quote(body.from_currency, body.to_currency, body.amount_minor)


@router.post("/redeem", tags=["redeem"])
def redeem(body: RedeemBody):
    # Get recipient and validate they exist
    recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": body.recipient_id}).get("Item")
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    
    # Get recipient's wallet details
    recipient_private_key = recipient.get("private_key")
    recipient_public_key = recipient.get("public_key")
    recipient_address = recipient.get("address")
    recipient_seed = recipient.get("seed")
    
    if not recipient_private_key or not recipient_public_key:
        raise HTTPException(400, "Recipient wallet not properly configured")
    
    # Derive address if not stored
    if not recipient_address:
        recipient_address = derive_address_from_public_key(recipient_public_key)
        if not recipient_address:
            raise HTTPException(400, "Cannot derive recipient address from public key")
    
    # Convert amount and check XRPL wallet balance
    amount_major = body.amount_minor / 100.0  # Convert minor units to major units
    amount_usd = amount_major  # Assuming USD
    
    # Check XRPL wallet balance
    recipient_balance_drops = fetch_xrp_balance_drops(recipient_address)
    if recipient_balance_drops is None:
        raise HTTPException(500, "Unable to check recipient wallet balance")
    
    recipient_balance_usd = xrp_drops_to_usd(recipient_balance_drops)
    
    if recipient_balance_usd < amount_usd:
        raise HTTPException(400, f"Insufficient XRPL wallet balance. Available: ${recipient_balance_usd:.2f}, Required: ${amount_usd:.2f}")
    
    # Get NGO/store destination address (for now, use NGO hot address)
    tx_hash = offramp_via_faucet(recipient_seed, recipient_address, amount_usd, memos={"Redeem": body.voucher_id, "Store": body.store_id, "Program": body.program_id})

    # Create quote and payout record
    quote = get_quote("XRP", body.currency, body.amount_minor)
    payout_id = str(uuid.uuid4())
    store_id = str(uuid.uuid4())  # In real scenario, validate store_id exists
    ngo_id = recipient["ngo_id"]

    # Store payout record
    TBL_PAYOUTS.put_item(Item={
        "payout_id": payout_id,
        "store_id": store_id,
        "program_id": body.program_id,
        "amount_minor": body.amount_minor,
        "currency": body.currency,
        "quote_id": quote["quote_id"],
        "xrpl_tx_hash": tx_hash,
        "offramp_ref": None,
        "status": "paid",  # Mark as success since we did the transfer
        "ngo_id": ngo_id,
    })

    # Record the transaction in moves table
    memos = {"voucher_id": body.voucher_id, "store_id": body.store_id, "program_id": body.program_id}
    TBL_MOVES.put_item(Item={
        "tx_hash": tx_hash,
        "classic_address": recipient_address,
        "direction": "out",
        "delivered_currency": "XRP",
        "delivered_minor": usd_to_xrp_drops(amount_usd),
        "memos": memos,
        "validated_ledger": 0,
        "ngo_id": ngo_id,
    })

    return {
        "payout_id": payout_id,
        "store_currency": body.currency,
        "amount_minor": body.amount_minor,
        "quote": quote,
        "xrpl_tx_hash": tx_hash,
        "status": "completed",
        "recipient_address": recipient_address,
        "amount_transferred_usd": amount_usd,
    }


@router.put("/stores/{store_id}/payout-method", tags=["stores"])
def upsert_store_payout_method(store_id: str, body: StorePayoutMethod):
    TBL_STORE_METHODS.put_item(Item={"store_id": store_id, "method": body.method, "currency": body.currency, "detail": body.detail, "updated_at": now_iso()})
    return {"ok": True}


@router.post("/payouts", tags=["payouts"])
def create_payout(body: StorePayoutBody):
    quote = get_quote("XRP", body.currency, body.amount_minor)
    memos = {"voucher_id": "batch", "store_id": body.store_id, "program_id": body.program_id}
    # tx_hash = offramp_via_faucet(recipient_private_key, recipient_address, amount_usd, memos=memos)
    tx_hash = "simulated-tx-hash-for-dev-only"
    payout_id = str(uuid.uuid4())
    store_uuid = str(uuid.uuid4())
    # Ensure store_id is a valid UUID string
    TBL_PAYOUTS.put_item(Item={
        "payout_id": payout_id,
        "store_id": store_uuid,
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
