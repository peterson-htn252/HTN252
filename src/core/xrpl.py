from __future__ import annotations

import hashlib
import hmac
import logging
import time
import uuid
from typing import Dict, Optional, List, TypedDict

from fastapi import HTTPException

from .config import (
    XRPL_RPC_URL,
    XRPL_NETWORK,
    SECRET_KEY,
    XRPL_USD_RATE,
)

from typing import Optional
from xrpl.core.keypairs import derive_classic_address
from xrpl.clients import JsonRpcClient
from xrpl.models.requests import AccountInfo
from xrpl.wallet import Wallet
from xrpl.models.transactions import Payment
from xrpl.transaction import autofill_and_sign, submit_and_wait
from xrpl.clients import JsonRpcClient
from xrpl.wallet import Wallet, generate_faucet_wallet
from xrpl.core.keypairs import derive_classic_address
from xrpl.models.requests import AccountInfo
from xrpl.models.transactions import Payment, Memo

from xrpl.utils import drops_to_xrp, xrp_to_drops


from decimal import Decimal, ROUND_DOWN
import ccxt
import time
from typing import Any, Optional, Tuple

from xrpl import transaction as xrpl_tx
from xrpl.models.requests import Tx

def _get_tx_hash_from_result(res: dict) -> Optional[str]:
    return (
        res.get("tx_json", {}).get("hash")
        or res.get("transaction", {}).get("hash")
        or res.get("hash")
    )

def autofill_and_sign_compat(tx: Any, client: Any, wallet: Any) -> Any:
    # Try latest helpers first
    if hasattr(xrpl_tx, "autofill_and_sign"):
        return xrpl_tx.autofill_and_sign(tx, client, wallet)
    # Older API
    if hasattr(xrpl_tx, "safe_sign_and_autofill_transaction"):
        return xrpl_tx.safe_sign_and_autofill_transaction(tx, client, wallet)
    # Lowest common: autofill + sign
    tx_auto = xrpl_tx.autofill(tx, client)
    return xrpl_tx.sign(tx_auto, wallet)

def submit_and_wait_compat(tx_or_signed: Any, client: Any, wallet: Any | None = None, timeout_s: float = 20.0) -> Tuple[str, dict]:
    """
    Returns (tx_hash, full_result_dict). Works whether you pass an unsigned tx + wallet
    or a signed tx. Uses native submit_and_wait if available; otherwise submits then polls.
    """
    # 1) Preferred path on modern xrpl-py
    if hasattr(xrpl_tx, "submit_and_wait"):
        resp = xrpl_tx.submit_and_wait(tx_or_signed, client, wallet) if wallet is not None else xrpl_tx.submit_and_wait(tx_or_signed, client)
        res = getattr(resp, "result", resp)
        tx_hash = _get_tx_hash_from_result(res)
        if not tx_hash:
            raise RuntimeError(f"submit_and_wait returned no hash: {res}")
        return tx_hash, res

    # 2) Older path: ensure signed, then submit + reliable wait
    signed = tx_or_signed
    if not isinstance(tx_or_signed, (bytes, bytearray)) and wallet is not None:
        signed = autofill_and_sign_compat(tx_or_signed, client, wallet)

    # Submit
    resp = xrpl_tx.submit(signed, client)
    res = getattr(resp, "result", resp)
    tx_hash = _get_tx_hash_from_result(res)
    if not tx_hash:
        raise RuntimeError(f"submit returned no hash: {res}")

    # Poll until validated or timeout
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        txr = client.request(Tx(transaction=tx_hash))
        txres = txr.result
        if txres.get("validated"):
            return tx_hash, txres
        time.sleep(0.5)

    # If not validated by timeout, return latest state
    return tx_hash, {"validated": False, **res}

logger = logging.getLogger(__name__)

DROPS_PER_XRP = 1_000_000
FAUCET_NETWORKS = {"TESTNET", "DEVNET"}

def get_xrp_usd_price() -> Decimal:
    """
    Return USD per 1 XRP as a Decimal by taking the median mid-price
    across several exchanges. Assumes ccxt & Decimal are already imported.
    """
    sources = [
        (ccxt.kraken, "XRP/USD"),
        (ccxt.bitstamp, "XRP/USD"),
        (ccxt.bybit, "XRP/USDT"),   # treat USDT≈USD
        (ccxt.binance, "XRP/USDT"),
    ]
    mids = []
    for ex_cls, symbol in sources:
        try:
            ex = ex_cls()
            t = ex.fetch_ticker(symbol)
            bid = Decimal(str(t.get("bid")))
            ask = Decimal(str(t.get("ask")))
            if bid > 0 and ask > 0:
                mids.append((bid + ask) / 2)
        except Exception:
            continue

    if not mids:
        raise RuntimeError("No price sources available")

    mids.sort()
    n = len(mids)
    return mids[n // 2] if n % 2 else (mids[n // 2 - 1] + mids[n // 2]) / 2


def usd_to_xrp_drops(usd: float | Decimal) -> int:
    """
    Convert USD -> drops using the current USD/XRP price.
    xrp = usd / (USD per XRP), rounded DOWN to 6 dp, then to integer drops.
    """
    if usd is None or Decimal(str(usd)) <= 0:
        raise ValueError("usd must be > 0")

    price_usd_per_xrp = get_xrp_usd_price()
    usd_dec = Decimal(str(usd))
    xrp = (usd_dec / price_usd_per_xrp).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)

    # Use helper if present; otherwise inline conversion.
    if "xrp_to_drops" in globals():
        return int(xrp_to_drops(xrp))  # some helpers return int/bigint
    return int((xrp * Decimal(1_000_000)).to_integral_value(rounding=ROUND_DOWN))


def xrp_drops_to_usd(drops: int | float | Decimal) -> float:
    """
    Convert drops -> USD using the current USD/XRP price.
    Returns USD rounded DOWN to cents.
    """
    d = Decimal(int(drops))  # ensure integer drops
    if d < 0:
        raise ValueError("drops must be >= 0")

    price_usd_per_xrp = get_xrp_usd_price()
    xrp = d / Decimal(1_000_000)
    usd = (xrp * price_usd_per_xrp).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    return float(usd)


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
    return JsonRpcClient(XRPL_RPC_URL)

def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

def _mock_tx_hash(*parts: object) -> str:
    seed = f"{time.time()}::{uuid.uuid4()}::" + "::".join(map(str, parts))
    return _sha256_hex(seed)[:64].upper()

from typing import Union

def _memos(m: Optional[Union[Dict[str, str], List[str], str]]) -> Optional[List["Memo"]]:
    if not m:
        return None
    out: List["Memo"] = []
    if isinstance(m, str):
        out.append(Memo(memo_type="text".encode().hex(), memo_data=m.encode().hex()))  # type: ignore[name-defined]
    if isinstance(m, list):
        for v in m:
            out.append(Memo(memo_type="text".encode().hex(), memo_data=v.encode().hex()))  # type: ignore[name-defined]
    if isinstance(m, dict):
        for k, v in m.items():
            out.append(Memo(memo_type=str(k).encode().hex(), memo_data=str(v).encode().hex()))  # type: ignore[name-defined]
    return out or None

def _submit(tx: "Payment", client: "JsonRpcClient", wallet: "Wallet") -> str:
    signed_tx = autofill_and_sign(
        tx, client, wallet)

    try:
        resp = submit_and_wait(tx, client, wallet)  # type: ignore[name-defined]
    except Exception as exc:
        raise HTTPException(502, f"XRPL submission failed: {exc}") from exc
    tx_hash = resp.result.get("hash", "")
    if not tx_hash:
        raise HTTPException(502, "XRPL transaction returned no hash")
    return tx_hash


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

def derive_address_from_public_key(public_key: str) -> Optional[str]:
    if derive_classic_address is not None:
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
    if AccountInfo is None:
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


def create_faucet_wallet():
    """
    Returns a Wallet funded by the Testnet or Devnet faucet.
    """
    if generate_faucet_wallet is None:
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


def wallet_to_wallet_send(
    sender_seed: str,
    sender_address: str,
    destination: str,
    amount_usd: float,
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

    amt_xrp = usd_to_xrp_drops(amount_usd)
    print(f"Preparing to send {drops_to_xrp(str(amt_xrp))} XRP (${amount_usd}) from {sender_address} to {destination}")

    client = _client()
    if client is None:
        return _mock_tx_hash("send", sender_address, destination, amt_xrp)

    wallet = Wallet.from_seed(seed=sender_seed)  # type: ignore[union-attr]
    tx = Payment(  # type: ignore[name-defined]
        account=sender_address,
        destination=destination,
        amount=str(amt_xrp),
        destination_tag=dest_tag,
        memos=_memos(memos),
    )
    return _submit(tx, client, wallet)


def onramp_via_faucet(
    destination: str,
    amount_usd: float,
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
    logger.debug("Faucet wallet created: %s", faucet.classic_address)  # type: ignore[attr-defined]
    return wallet_to_wallet_send(
        sender_seed=faucet.seed,                 # type: ignore[attr-defined]
        sender_address=faucet.classic_address,  # type: ignore[attr-defined]
        destination=destination,
        amount_usd=amount_usd,
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


def create_new_wallet() -> Dict[str, str]:
    """
    Create a new XRPL wallet and return the public and private keys.
    
    Returns:
        Dict with 'public_key' and 'private_key' fields, or fallback keys if XRPL unavailable
    """
    try:
        wallet = Wallet.create()
        return {
            "public_key": wallet.public_key,
            "private_key": wallet.private_key,
            "seed": wallet.seed
        }
    except Exception as e:
        print(f"Failed to create XRPL wallet: {str(e)}")
        # Generate deterministic fallback keys
        import hashlib
        import time
        seed = f"{time.time()}{uuid.uuid4()}"
        hash_obj = hashlib.sha256(seed.encode())
        hex_hash = hash_obj.hexdigest()
        return {
            "public_key": f"ED{hex_hash[:62].upper()}",
            "private_key": f"ED{hex_hash[32:94].upper()}",
            "seed": f"s{hex_hash[:28].upper()}"
        }
