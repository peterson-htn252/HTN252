import time
import uuid
import hmac
import hashlib
from typing import Dict, Optional, List

from fastapi import HTTPException

from .config import (
    XRPL_RPC_URL,
    XRPL_NETWORK,
    NGO_HOT_SEED,
    NGO_HOT_ADDRESS,
    OFFRAMP_DEPOSIT_ADDRESS,
    OFFRAMP_DEST_TAG,
    SECRET_KEY,
)

try:
    from xrpl.clients import JsonRpcClient
    from xrpl.wallet import Wallet
    from xrpl.models.transactions import Payment, Memo
    from xrpl.transaction import safe_sign_and_submit_transaction
    XRPL_AVAILABLE = True
except Exception:
    XRPL_AVAILABLE = False
    JsonRpcClient = None  # type: ignore
    Wallet = None  # type: ignore
    Payment = None  # type: ignore
    Memo = None  # type: ignore
    safe_sign_and_submit_transaction = None  # type: ignore


def make_challenge(recipient_id: str, address: str) -> str:
    msg = f"link:{recipient_id}:{address}:{int(time.time()//300)}"
    mac = hmac.new(SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{mac}"


def verify_challenge(signature: str, recipient_id: str, address: str) -> bool:
    expected = make_challenge(recipient_id, address)
    return hmac.compare_digest(signature, expected)


def xrpl_client() -> Optional[JsonRpcClient]:
    if not XRPL_AVAILABLE:
        return None
    return JsonRpcClient(XRPL_RPC_URL)


def get_quote(from_currency: str, to_currency: str, amount_minor: int) -> dict:
    rate_ppm = 1_000_000
    deliver_min = amount_minor
    send_max = int(amount_minor * 1.003)
    return {
        "quote_id": str(uuid.uuid4()),
        "from_currency": from_currency,
        "to_currency": to_currency,
        "amount_minor": amount_minor,
        "rate_ppm": rate_ppm,
        "deliver_min": deliver_min,
        "send_max": send_max,
    }


def to_drops(xrp_minor: int) -> int:
    return int(xrp_minor)


def pay_offramp_on_xrpl(amount_drops: int, memos: Dict[str, str]) -> str:
    if not XRPL_AVAILABLE:
        return "tx_placeholder_hash_no_xrpl"
    if not NGO_HOT_SEED or not NGO_HOT_ADDRESS:
        raise HTTPException(500, "NGO hot wallet not configured")
    client = xrpl_client()
    wallet = Wallet(seed=NGO_HOT_SEED, sequence=0)  # DEV ONLY
    memo_objs: List[Memo] = []
    for k, v in memos.items():
        memo_objs.append(Memo(memo_data=v.encode().hex(), memo_type=k.encode().hex()))
    dest = OFFRAMP_DEPOSIT_ADDRESS or NGO_HOT_ADDRESS
    tx = Payment(
        account=NGO_HOT_ADDRESS,
        destination=dest,
        amount=str(amount_drops),
        destination_tag=OFFRAMP_DEST_TAG or None,
        memos=memo_objs,
    )
    resp = safe_sign_and_submit_transaction(tx, client, wallet)
    return resp.result.get("tx_json", {}).get("hash", "")
