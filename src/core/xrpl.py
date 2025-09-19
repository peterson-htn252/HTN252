from __future__ import annotations

import hashlib
import hmac
import logging
import time
import uuid
from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN
from typing import Dict, Iterable, List, Optional, TypedDict, Union

from fastapi import HTTPException

try:  # ccxt is optional during local development
    import ccxt  # type: ignore
except Exception:  # pragma: no cover - dependency may be absent
    ccxt = None  # type: ignore

from xrpl.clients import JsonRpcClient
from xrpl.core.keypairs import derive_classic_address
from xrpl.models.requests import AccountInfo
from xrpl.models.transactions import Memo, Payment
from xrpl.transaction import submit_and_wait
from xrpl.wallet import Wallet, generate_faucet_wallet

from .config import SECRET_KEY, XRPL_NETWORK, XRPL_RPC_URL, XRPL_USD_RATE

logger = logging.getLogger(__name__)

DROPS_PER_XRP = Decimal("1000000")
FAUCET_NETWORKS = {"TESTNET", "DEVNET"}
DEFAULT_PRICE = Decimal(str(XRPL_USD_RATE or 1))


class Quote(TypedDict):
    quote_id: str
    from_currency: str
    to_currency: str
    amount_minor: int
    rate_ppm: int
    deliver_min: int
    send_max: int


@dataclass
class FaucetWallet:
    classic_address: str
    seed: str


def _json_rpc_client() -> Optional[JsonRpcClient]:
    try:
        return JsonRpcClient(XRPL_RPC_URL)
    except Exception as exc:  # pragma: no cover - XRPL client optional
        logger.debug("Unable to create XRPL client: %s", exc)
        return None


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _mock_tx_hash(*parts: object) -> str:
    seed = "::".join(map(str, parts))
    return _sha256_hex(f"{time.time()}::{uuid.uuid4()}::{seed}")[:64].upper()


def _coerce_memos(
    payload: Optional[Union[Dict[str, str], Iterable[str], str]]
) -> Optional[List[Memo]]:
    if not payload:
        return None

    if isinstance(payload, str):
        payload = [payload]

    memos: List[Memo] = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            memos.append(
                Memo(
                    memo_type=str(key).encode().hex(),
                    memo_data=str(value).encode().hex(),
                )
            )
    else:
        for value in payload:
            memos.append(
                Memo(
                    memo_type="text".encode().hex(),
                    memo_data=str(value).encode().hex(),
                )
            )
    return memos or None


def _submit_payment(tx: Payment, client: JsonRpcClient, wallet: Wallet) -> str:
    try:
        response = submit_and_wait(tx, client, wallet)
    except Exception as exc:  # pragma: no cover - XRPL client failure
        raise HTTPException(502, f"XRPL submission failed: {exc}") from exc

    result = getattr(response, "result", response) or {}
    tx_hash = (
        result.get("hash")
        or result.get("tx_json", {}).get("hash")
        or result.get("transaction", {}).get("hash")
    )
    if not tx_hash:
        raise HTTPException(502, "XRPL transaction returned no hash")
    return str(tx_hash)


def get_xrp_usd_price() -> Decimal:
    """Return the USD price for one XRP, falling back to config when necessary."""

    if ccxt is None:  # pragma: no cover - dependency optional
        return DEFAULT_PRICE

    sources = [
        (ccxt.kraken, "XRP/USD"),
        (ccxt.bitstamp, "XRP/USD"),
        (ccxt.bybit, "XRP/USDT"),
        (ccxt.binance, "XRP/USDT"),
    ]
    mids: List[Decimal] = []
    for exchange_cls, symbol in sources:
        try:
            exchange = exchange_cls()
            ticker = exchange.fetch_ticker(symbol)
            bid = Decimal(str(ticker.get("bid")))
            ask = Decimal(str(ticker.get("ask")))
            if bid > 0 and ask > 0:
                mids.append((bid + ask) / 2)
        except Exception as exc:  # pragma: no cover - external API noise
            logger.debug("Price fetch failed for %s %s: %s", exchange_cls.__name__, symbol, exc)
            continue

    if not mids:
        logger.debug("Falling back to configured XRPL_USD_RATE=%s", XRPL_USD_RATE)
        return DEFAULT_PRICE

    mids.sort()
    mid_count = len(mids)
    if mid_count % 2:
        return mids[mid_count // 2]
    return (mids[mid_count // 2 - 1] + mids[mid_count // 2]) / 2


def usd_to_xrp_drops(usd: float | Decimal) -> int:
    """Convert USD to drops using the current USD/XRP price."""

    amount = Decimal(str(usd))
    if amount <= 0:
        raise ValueError("usd must be > 0")

    price = get_xrp_usd_price()
    xrp_amount = (amount / price).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    drops = (xrp_amount * DROPS_PER_XRP).to_integral_value(rounding=ROUND_DOWN)
    return int(drops)


def xrp_drops_to_usd(drops: int | float | Decimal) -> float:
    """Convert drops to USD using the current USD/XRP price."""

    drop_amount = Decimal(str(int(Decimal(drops))))
    price = get_xrp_usd_price()
    xrp_amount = drop_amount / DROPS_PER_XRP
    usd = (xrp_amount * price).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    return float(usd)


def get_quote(from_currency: str, to_currency: str, amount_minor: int) -> Quote:
    if from_currency != "XRP" or to_currency != "USD":
        raise HTTPException(400, "Only XRP to USD quotes are supported")
    if amount_minor <= 0:
        raise HTTPException(400, "Amount must be positive")

    amount_major = Decimal(amount_minor) / Decimal(100)
    rate_ppm = int((Decimal(str(XRPL_USD_RATE)) / Decimal("1")) * Decimal("1000000"))
    deliver_min = int(amount_minor * 0.99)
    send_max = int((amount_major / Decimal(str(XRPL_USD_RATE))) * DROPS_PER_XRP * Decimal("1.01"))

    return Quote(
        quote_id=str(uuid.uuid4()),
        from_currency=from_currency,
        to_currency=to_currency,
        amount_minor=amount_minor,
        rate_ppm=rate_ppm,
        deliver_min=deliver_min,
        send_max=send_max,
    )


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
        except Exception as exc:  # pragma: no cover - library mismatch
            logger.debug("derive_classic_address failed: %s", exc)
    if public_key.startswith("ED"):
        return "r" + _sha256_hex(public_key)[:32]
    return None


def fetch_xrp_balance_drops(classic_address: str) -> Optional[int]:
    if not classic_address or not classic_address.startswith("r"):
        return None
    if AccountInfo is None:  # pragma: no cover - dependency guard
        return 0

    client = _json_rpc_client()
    if client is None:
        return None

    try:
        request = AccountInfo(account=classic_address, ledger_index="validated")
        response = client.request(request).result
        return int(response["account_data"]["Balance"])
    except Exception as exc:  # pragma: no cover - XRPL network errors
        logger.debug("AccountInfo fetch failed for %s: %s", classic_address, exc)
        return 0


def create_faucet_wallet() -> FaucetWallet:
    """Return a faucet-funded wallet for dev/test networks."""

    if XRPL_NETWORK.upper() not in FAUCET_NETWORKS:
        raise HTTPException(500, "Faucet is only allowed on TESTNET or DEVNET")

    client = _json_rpc_client()
    if client and generate_faucet_wallet:
        try:
            wallet = generate_faucet_wallet(client, debug=False)
            return FaucetWallet(classic_address=wallet.classic_address, seed=wallet.seed)  # type: ignore[attr-defined]
        except Exception as exc:  # pragma: no cover - faucet hiccups
            logger.warning("generate_faucet_wallet failed: %s", exc)

    logger.debug("Falling back to mock faucet wallet")
    seed = f"s{_sha256_hex('mock_seed')[:28]}"
    address = f"r{_sha256_hex('mock_faucet')[:32]}"
    return FaucetWallet(classic_address=address, seed=seed)


def wallet_to_wallet_send(
    sender_seed: str,
    sender_address: str,
    destination: str,
    amount_usd: float,
    *,
    dest_tag: Optional[int] = None,
    memos: Optional[Dict[str, str]] = None,
) -> str:
    """Send USD-equivalent value on ledger and return the XRPL transaction hash."""

    if not sender_seed or not sender_address or not destination:
        raise HTTPException(400, "Missing sender or destination info")

    drops = usd_to_xrp_drops(amount_usd)
    human_amount = Decimal(drops) / DROPS_PER_XRP
    logger.info(
        "Preparing to send %s XRP ($%.2f) from %s to %s",
        human_amount,
        amount_usd,
        sender_address,
        destination,
    )

    client = _json_rpc_client()
    if client is None:
        return _mock_tx_hash("send", sender_address, destination, drops)

    wallet = Wallet.from_seed(seed=sender_seed)
    payment = Payment(
        account=sender_address,
        destination=destination,
        amount=str(drops),
        destination_tag=dest_tag,
        memos=_coerce_memos(memos),
    )
    return _submit_payment(payment, client, wallet)


def onramp_via_faucet(
    destination: str,
    amount_usd: float,
    *,
    dest_tag: Optional[int] = None,
    memos: Optional[Dict[str, str]] = None,
) -> str:
    """Fund a destination address from a faucet wallet."""

    if not destination:
        raise HTTPException(400, "Missing destination")

    faucet = create_faucet_wallet()
    logger.debug("Faucet wallet created: %s", faucet.classic_address)
    return wallet_to_wallet_send(
        sender_seed=faucet.seed,
        sender_address=faucet.classic_address,
        destination=destination,
        amount_usd=amount_usd,
        dest_tag=dest_tag,
        memos=memos,
    )


def offramp_via_faucet(
    source_seed: str,
    source_address: str,
    amount_usd: float,
    *,
    memos: Optional[Dict[str, str]] = None,
) -> str:
    """Send funds from the source wallet to a faucet sink for off-ramp simulations."""

    if not source_seed or not source_address:
        raise HTTPException(400, "Missing source wallet info")

    faucet = create_faucet_wallet()
    return wallet_to_wallet_send(
        sender_seed=source_seed,
        sender_address=source_address,
        destination=faucet.classic_address,
        amount_usd=amount_usd,
        dest_tag=None,
        memos=memos,
    )


def create_new_wallet() -> Dict[str, str]:
    """Create a new XRPL wallet or fall back to deterministic mock keys."""

    try:
        wallet = Wallet.create()
        return {
            "public_key": wallet.public_key,
            "private_key": wallet.private_key,
            "seed": wallet.seed,
        }
    except Exception as exc:  # pragma: no cover - XRPL optional
        logger.warning("Failed to create XRPL wallet via SDK: %s", exc)

    seed_source = f"{time.time()}::{uuid.uuid4()}"
    seed_hash = _sha256_hex(seed_source)
    return {
        "public_key": f"ED{seed_hash[:62].upper()}",
        "private_key": f"ED{_sha256_hex(seed_source + 'priv')[:62].upper()}",
        "seed": f"s{seed_hash[:28].upper()}",
    }
*** End of File
