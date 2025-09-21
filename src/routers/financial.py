import uuid
from typing import Dict, Tuple

from fastapi import APIRouter, HTTPException

from models import (
    QuoteRequest,
    RedeemBody,
    StorePayoutBody,
    StorePayoutMethod,
    WalletBalanceUSDRequest,
)
from core.xrpl import (
    derive_address_from_public_key,
    get_quote,
    offramp_via_faucet,
    usd_to_xrp_drops,
)
from core.database import TBL_MOVES, TBL_PAYOUTS, TBL_RECIPIENTS, TBL_STORE_METHODS
from core.utils import now_iso
from core.wallet import (
    WalletDetails,
    ensure_balance,
    extract_wallet,
    get_wallet_balance,
)

router = APIRouter()


def _get_recipient(recipient_id: str) -> dict:
    recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    return recipient


def _build_redeem_memos(body: RedeemBody) -> Tuple[Dict[str, str], Dict[str, str]]:
    ledger_memos = {
        "Redeem": body.voucher_id,
        "Store": body.store_id,
        "Program": body.program_id,
    }
    move_memos = {
        "voucher_id": body.voucher_id,
        "store_id": body.store_id,
        "program_id": body.program_id,
    }
    return ledger_memos, move_memos


def _record_redeem_transactions(
    *,
    ngo_id: str,
    wallet: WalletDetails,
    body: RedeemBody,
    quote: dict,
    tx_hash: str,
    amount_usd: float,
    move_memos: Dict[str, str],
) -> str:
    payout_id = str(uuid.uuid4())
    body.store_id = str(uuid.uuid4())
    TBL_PAYOUTS.put_item(
        Item={
            "payout_id": payout_id,
            "store_id": body.store_id,
            "program_id": body.program_id,
            "amount_minor": body.amount_minor,
            "currency": body.currency,
            "quote_id": quote["quote_id"],
            "xrpl_tx_hash": tx_hash,
            "offramp_ref": None,
            "status": "paid",
            "ngo_id": ngo_id,
        }
    )

    TBL_MOVES.put_item(
        Item={
            "tx_hash": tx_hash,
            "classic_address": wallet.address,
            "direction": "out",
            "delivered_currency": "XRP",
            "delivered_minor": usd_to_xrp_drops(amount_usd),
            "memos": move_memos,
            "validated_ledger": 0,
            "ngo_id": ngo_id,
        }
    )

    return payout_id


@router.post("/quotes", tags=["quotes"])
def create_quote(body: QuoteRequest):
    return get_quote(body.from_currency, body.to_currency, body.amount_minor)


@router.post("/redeem", tags=["redeem"])
def redeem(body: RedeemBody):
    recipient = _get_recipient(body.recipient_id)
    wallet = extract_wallet(
        recipient,
        error_detail="Recipient wallet not properly configured",
        status_code=400,
    )

    amount_usd = body.amount_minor / 100.0
    ensure_balance(
        wallet.address,
        amount_usd,
        entity="recipient",
        missing_detail="Unable to check recipient wallet balance",
        missing_status=500,
    )

    ledger_memos, move_memos = _build_redeem_memos(body)
    tx_hash = offramp_via_faucet(wallet.seed, wallet.address, amount_usd, memos=ledger_memos)

    quote = get_quote("XRP", body.currency, body.amount_minor)
    ngo_id = recipient.get("ngo_id")
    if not ngo_id:
        raise HTTPException(500, "Recipient record missing NGO association")

    payout_id = _record_redeem_transactions(
        ngo_id=ngo_id,
        wallet=wallet,
        body=body,
        quote=quote,
        tx_hash=tx_hash,
        amount_usd=amount_usd,
        move_memos=move_memos,
    )

    return {
        "payout_id": payout_id,
        "store_currency": body.currency,
        "amount_minor": body.amount_minor,
        "quote": quote,
        "xrpl_tx_hash": tx_hash,
        "status": "completed",
        "recipient_address": wallet.address,
        "amount_transferred_usd": amount_usd,
    }


@router.put("/stores/{store_id}/payout-method", tags=["stores"])
def upsert_store_payout_method(store_id: str, body: StorePayoutMethod):
    TBL_STORE_METHODS.put_item(
        Item={
            "store_id": store_id,
            "method": body.method,
            "currency": body.currency,
            "detail": body.detail,
            "updated_at": now_iso(),
        }
    )
    return {"ok": True}


@router.post("/payouts", tags=["payouts"])
def create_payout(body: StorePayoutBody):
    quote = get_quote("XRP", body.currency, body.amount_minor)
    memos = {"voucher_id": "batch", "store_id": body.store_id, "program_id": body.program_id}
    # tx_hash = offramp_via_faucet(recipient_private_key, recipient_address, amount_usd, memos=memos)
    tx_hash = "simulated-tx-hash-for-dev-only"
    payout_id = str(uuid.uuid4())
    TBL_PAYOUTS.put_item(
        Item={
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
        }
    )
    return {"payout_id": payout_id, "xrpl_tx_hash": tx_hash, "status": "processing"}


@router.post("/wallets/balance-usd", tags=["wallets"])
def wallet_balance_usd(body: WalletBalanceUSDRequest):
    """Return wallet balance in USD from a given XRPL public key.
    Dev-safe: if XRPL is unavailable or account unfunded, returns balance_usd = 0.
    """
    address = derive_address_from_public_key(body.public_key)
    if not address:
        return {"address": None, "balance_drops": 0, "balance_usd": 0.0}

    balance = get_wallet_balance(address)
    if balance is None:
        return {"address": address, "balance_drops": 0, "balance_usd": 0.0}

    return {
        "address": address,
        "balance_drops": balance.balance_drops,
        "balance_usd": balance.balance_usd,
    }


@router.get("/stores/{store_id}/payouts", tags=["stores"])
def list_store_payouts(store_id: str):
    response = TBL_PAYOUTS.scan(
        FilterExpression="store_id = :sid",
        ExpressionAttributeValues={":sid": store_id},
    )
    items = response.get("Items", [])
    return {"items": items}
