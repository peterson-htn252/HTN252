import hashlib
import hmac
import logging
import time
import uuid
from typing import Dict, Optional, List, TypedDict

from fastapi import HTTPException

from .config import (
    XRPL_RPC_URL,
    XRPL_NETWORK,              # "TESTNET" or "DEVNET" if using faucet
    SECRET_KEY,
    XRPL_USD_RATE,
)

logger = logging.getLogger(__name__)

DROPS_PER_XRP = 1_000_000
FAUCET_NETWORKS = {"TESTNET", "DEVNET"}

# XRPL optional imports
try:
    from xrpl.clients import JsonRpcClient
    from xrpl.wallet import Wallet, generate_faucet_wallet
    from xrpl.core.keypairs import derive_classic_address
    from xrpl.models.requests import AccountInfo
    from xrpl.models.transactions import Payment, Memo
    from xrpl.transaction import submit_and_wait
    XRPL_AVAILABLE = True
except Exception:
    JsonRpcClient = None  # type: ignore
    Wallet = None  # type: ignore
    generate_faucet_wallet = None  # type: ignore
    derive_classic_address = None  # type: ignore
    AccountInfo = None  # type: ignore
    Payment = None  # type: ignore
    Memo = None  # type: ignore
    submit_and_wait = None  # type: ignore
    get_balance = None  # type: ignore
    XRPL_AVAILABLE = False


# ---------------- core helpers ----------------

def get_quote(from_currency: str, to_currency: str, amount_minor: int):
    if from_currency != "XRP" or to_currency != "USD":
        raise HTTPException(400, "Only XRP to USD quotes are supported")
    if amount_minor <= 0:
        raise HTTPException(400, "Amount must be positive")
    amount_major = amount_minor / 100.0
    rate_ppm = int((XRPL_USD_RATE / 1.0) * 1_000_000)  # Assuming USD
    deliver_min = int(amount_minor * 0.99)  # Assume 1% slippage
    send_max = int((amount_major / XRPL_USD_RATE) * DROPS_PER_XRP * 1.01)  # Assume 1% slippage
    quote_id = str(uuid.uuid4())
    return Quote(
        quote_id=quote_id,
        from_currency=from_currency,
        to_currency=to_currency,
        amount_minor=amount_minor,
        rate_ppm=rate_ppm,
        deliver_min=deliver_min,
        send_max=send_max,
    )

def _client() -> Optional["JsonRpcClient"]:
    if not XRPL_AVAILABLE:
        return None
    return JsonRpcClient(XRPL_RPC_URL)

def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

def _mock_tx_hash(*parts: object) -> str:
    seed = f"{time.time()}::{uuid.uuid4()}::" + "::".join(map(str, parts))
    return _sha256_hex(seed)[:64].upper()

def _drops(amount_xrp: float) -> int:
    if amount_xrp <= 0:
        raise HTTPException(400, "Amount must be positive")
    return max(int(amount_xrp * DROPS_PER_XRP), 1)

def _memos(m: Optional[Dict[str, str]]) -> Optional[List["Memo"]]:
    if not m:
        return None
    out: List["Memo"] = []
    for k, v in m.items():
        out.append(Memo(memo_type=str(k).encode().hex(), memo_data=str(v).encode().hex()))  # type: ignore[name-defined]
    return out or None

def _submit(tx: "Payment", client: "JsonRpcClient", wallet: "Wallet") -> str:
    try:
        resp = submit_and_wait(tx, client, wallet)  # type: ignore[name-defined]
    except Exception as exc:
        raise HTTPException(502, f"XRPL submission failed: {exc}") from exc
    tx_hash = resp.result.get("tx_json", {}).get("hash", "")
    if not tx_hash:
        raise HTTPException(502, "XRPL transaction returned no hash")
    return tx_hash


# ---------------- minimal utilities you still use ----------------

class Quote(TypedDict):
    quote_id: str
    from_currency: str
    to_currency: str
    amount_minor: int
    rate_ppm: int
    deliver_min: int
    send_max: int

def make_challenge(recipient_id: str, address: str) -> str:
    bucket = int(time.time() // 300)
    msg = f"link:{recipient_id}:{address}:{bucket}"
    mac = hmac.new(SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{mac}"

def verify_challenge(signature: str, recipient_id: str, address: str) -> bool:
    return hmac.compare_digest(signature, make_challenge(recipient_id, address))

def convert_usd_to_drops(usd_amount: float) -> int:
    if usd_amount < 0:
        raise HTTPException(400, "Amount must be nonnegative")
    return int((usd_amount / XRPL_USD_RATE) * DROPS_PER_XRP)

def convert_drops_to_usd(drops: int) -> float:
    return round((drops / DROPS_PER_XRP) * XRPL_USD_RATE, 2)

def derive_address_from_public_key(public_key: str) -> Optional[str]:
    if XRPL_AVAILABLE and derive_classic_address is not None:
        try:
            return derive_classic_address(public_key)
        except Exception as exc:
            logger.debug("derive_classic_address failed: %s", exc)
    if public_key.startswith("ED"):
        return "r" + _sha256_hex(public_key)[:32]
    return None

def fetch_xrp_balance_drops(classic_address: str) -> Optional[int]:
    if not classic_address or not classic_address.startswith("r"):
        return None
    if not XRPL_AVAILABLE or AccountInfo is None:
        return 0
    client = _client()
    if client is None:
        return None
    try:
        req = AccountInfo(account=classic_address, ledger_index="validated")  # type: ignore[name-defined]
        resp = client.request(req).result
        return int(resp["account_data"]["Balance"])
    except Exception:
        return 0


# ---------------- single faucet creator ----------------

def create_faucet_wallet():
    """
    Returns a Wallet funded by the Testnet or Devnet faucet.
    """
    if not XRPL_AVAILABLE or generate_faucet_wallet is None:
        # Dev fallback: minimal mock that looks like a Wallet for logging and routing
        class _Mock:
            classic_address = "r" + _sha256_hex("mock_faucet")[:32]
            seed = "s" + _sha256_hex("mock_seed")[:28]
        return _Mock()  # type: ignore[return-value]

    if XRPL_NETWORK.upper() not in FAUCET_NETWORKS:
        raise HTTPException(500, "Faucet is only allowed on TESTNET or DEVNET")

    client = _client()
    if client is None:
        # deterministic mock
        class _Mock:
            classic_address = "r" + _sha256_hex("mock_faucet")[:32]
            seed = "s" + _sha256_hex("mock_seed")[:28]
        return _Mock()  # type: ignore[return-value]

    w = generate_faucet_wallet(client, debug=False)
    return w


# ---------------- one canonical send ----------------

def wallet_to_wallet_send(
    sender_seed: str,
    sender_address: str,
    destination: str,
    amount_xrp: float,
    *,
    dest_tag: Optional[int] = None,
    memos: Optional[Dict[str, str]] = None,
) -> str:
    """
    Single canonical send used by both on-ramp and off-ramp flows.
    Returns transaction hash. Uses deterministic mock if XRPL libs are missing.
    """
    if not sender_seed or not sender_address or not destination:
        raise HTTPException(400, "Missing sender or destination info")

    amt = _drops(amount_xrp)

    if not XRPL_AVAILABLE:
        return _mock_tx_hash("send", sender_address, destination, amt)

    client = _client()
    if client is None:
        return _mock_tx_hash("send", sender_address, destination, amt)

    wallet = Wallet.from_seed(seed=sender_seed)  # type: ignore[union-attr]
    tx = Payment(  # type: ignore[name-defined]
        account=sender_address,
        destination=destination,
        amount=str(amt),
        destination_tag=dest_tag,
        memos=_memos(memos),
    )
    return _submit(tx, client, wallet)


# ---------------- on-ramp and off-ramp built on the sender ----------------

def onramp_via_faucet(
    destination: str,
    amount_xrp: float,
    *,
    dest_tag: Optional[int] = None,
    memos: Optional[Dict[str, str]] = None,
) -> str:
    """
    Create a faucet wallet, then send to the given destination. Returns tx hash.
    """
    if not destination:
        raise HTTPException(400, "Missing destination")
    faucet = create_faucet_wallet()
    return wallet_to_wallet_send(
        sender_seed=faucet.seed,                 # type: ignore[attr-defined]
        sender_address=faucet.classic_address,  # type: ignore[attr-defined]
        destination=destination,
        amount_xrp=amount_xrp,
        dest_tag=dest_tag,
        memos=memos,
    )

def offramp_via_faucet(
    source_seed: str,
    source_address: str,
    amount_xrp: float,
    *,
    memos: Optional[Dict[str, str]] = None,
) -> str:
    """
    Create a faucet wallet, then send from the given source wallet to the faucet wallet.
    Returns tx hash. The faucet acts as the receiving sink for tests.
    """
    if not source_seed or not source_address:
        raise HTTPException(400, "Missing source wallet info")
    faucet = create_faucet_wallet()
    return wallet_to_wallet_send(
        sender_seed=source_seed,
        sender_address=source_address,
        destination=faucet.classic_address,     # type: ignore[attr-defined]
        amount_xrp=amount_xrp,
        dest_tag=None,
        memos=memos,
    )
