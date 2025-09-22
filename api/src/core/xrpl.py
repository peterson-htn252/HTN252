"""XRPL helpers with a lean implementation that assumes required libraries exist."""

from __future__ import annotations

import hashlib
import hmac
import time
import uuid
from decimal import Decimal, ROUND_DOWN
from typing import Dict, List, Optional, Tuple, TypedDict, Union

from fastapi import HTTPException

from .config import SECRET_KEY, XRPL_NETWORK, XRPL_RPC_URL, XRPL_USD_RATE

from xrpl import transaction as xrpl_tx
from xrpl.clients import JsonRpcClient
from xrpl.core.keypairs import derive_classic_address
from xrpl.models.requests import AccountInfo, Tx
from xrpl.models.transactions import Memo, Payment
from xrpl.wallet import Wallet, generate_faucet_wallet


DROPS_PER_XRP = Decimal("1000000")
FAUCET_NETWORKS = {"TESTNET", "DEVNET"}


class Quote(TypedDict):
    quote_id: str
    from_currency: str
    to_currency: str
    amount_minor: int
    rate_ppm: int
    deliver_min: int
    send_max: int


def _get_tx_hash_from_result(result: Dict[str, object]) -> Optional[str]:
    return (
        result.get("tx_json", {}).get("hash")
        or result.get("transaction", {}).get("hash")
        or result.get("hash")
    )


def autofill_and_sign_compat(tx: Payment, client: JsonRpcClient, wallet: Wallet) -> object:
    if hasattr(xrpl_tx, "autofill_and_sign"):
        return xrpl_tx.autofill_and_sign(tx, client, wallet)
    if hasattr(xrpl_tx, "safe_sign_and_autofill_transaction"):
        return xrpl_tx.safe_sign_and_autofill_transaction(tx, client, wallet)
    tx_auto = xrpl_tx.autofill(tx, client)
    return xrpl_tx.sign(tx_auto, wallet)


def submit_and_wait_compat(
    tx_or_signed: object,
    client: JsonRpcClient,
    wallet: Wallet | None = None,
    timeout_s: float = 20.0,
) -> Tuple[str, Dict[str, object]]:
    if hasattr(xrpl_tx, "submit_and_wait"):
        response = (
            xrpl_tx.submit_and_wait(tx_or_signed, client, wallet)
            if wallet is not None
            else xrpl_tx.submit_and_wait(tx_or_signed, client)
        )
        result = getattr(response, "result", response)
        tx_hash = _get_tx_hash_from_result(result)
        if not tx_hash:
            raise RuntimeError("submit_and_wait returned no hash")
        return tx_hash, result  # type: ignore[return-value]

    signed = tx_or_signed
    if wallet is not None and not isinstance(tx_or_signed, (bytes, bytearray)):
        signed = autofill_and_sign_compat(tx_or_signed, client, wallet)

    response = xrpl_tx.submit(signed, client)
    result = getattr(response, "result", response)
    tx_hash = _get_tx_hash_from_result(result)
    if not tx_hash:
        raise RuntimeError("submit returned no hash")

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        tx_response = client.request(Tx(transaction=tx_hash))
        tx_result = getattr(tx_response, "result", tx_response)
        if tx_result.get("validated"):
            return tx_hash, tx_result  # type: ignore[return-value]
        time.sleep(0.5)

    return tx_hash, {"validated": False, **result}


def _create_client() -> JsonRpcClient:
    return JsonRpcClient(XRPL_RPC_URL)


def _encode_memos(
    memos: Optional[Union[Dict[str, str], List[str], str]]
) -> Optional[List[Memo]]:
    if memos is None:
        return None

    encoded: List[Memo] = []
    if isinstance(memos, str):
        encoded.append(
            Memo(
                memo_type="text".encode().hex(),
                memo_data=memos.encode().hex(),
            )
        )
    elif isinstance(memos, list):
        for entry in memos:
            encoded.append(
                Memo(
                    memo_type="text".encode().hex(),
                    memo_data=str(entry).encode().hex(),
                )
            )
    else:
        for key, value in memos.items():
            encoded.append(
                Memo(
                    memo_type=str(key).encode().hex(),
                    memo_data=str(value).encode().hex(),
                )
            )
    return encoded or None


def get_xrp_usd_price() -> Decimal:
    return Decimal(str(XRPL_USD_RATE))


def usd_to_xrp_drops(usd: float | Decimal) -> int:
    usd_value = Decimal(str(usd))
    if usd_value <= 0:
        raise ValueError("usd must be > 0")

    price = get_xrp_usd_price()
    xrp = (usd_value / price).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    drops = (xrp * DROPS_PER_XRP).to_integral_value(rounding=ROUND_DOWN)
    return int(drops)


def xrp_drops_to_usd(drops: int | float | Decimal) -> float:
    drops_value = Decimal(str(drops))
    if drops_value < 0:
        raise ValueError("drops must be >= 0")

    price = get_xrp_usd_price()
    usd = ((drops_value / DROPS_PER_XRP) * price).quantize(
        Decimal("0.01"), rounding=ROUND_DOWN
    )
    return float(usd)


def get_quote(from_currency: str, to_currency: str, amount_minor: int) -> Quote:
    if from_currency != "XRP" or to_currency != "USD":
        raise HTTPException(400, "Only XRP to USD quotes are supported")
    if amount_minor <= 0:
        raise HTTPException(400, "Amount must be positive")

    amount_major = Decimal(amount_minor) / Decimal(100)
    price = get_xrp_usd_price()
    rate_ppm = int((price * Decimal(1_000_000)).to_integral_value(rounding=ROUND_DOWN))
    deliver_min = int(
        (Decimal(amount_minor) * Decimal("0.99")).to_integral_value(
            rounding=ROUND_DOWN
        )
    )
    send_max = int(
        (
            (amount_major / price)
            * DROPS_PER_XRP
            * Decimal("1.01")
        ).to_integral_value(rounding=ROUND_DOWN)
    )

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
    message = f"link:{recipient_id}:{address}:{bucket}"
    mac = hmac.new(SECRET_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()
    return f"{message}:{mac}"


def verify_challenge(signature: str, recipient_id: str, address: str) -> bool:
    return hmac.compare_digest(signature, make_challenge(recipient_id, address))


def derive_address_from_public_key(public_key: str) -> Optional[str]:
    try:
        return derive_classic_address(public_key)
    except Exception:
        return None


def fetch_xrp_balance_drops(classic_address: str) -> Optional[int]:
    if not classic_address:
        return None

    client = _create_client()
    try:
        request = AccountInfo(account=classic_address, ledger_index="validated")
        response = client.request(request)
    except Exception:
        return None

    result = getattr(response, "result", response)
    try:
        return int(result["account_data"]["Balance"])
    except Exception:
        return None


def _submit_transaction(tx: Payment, client: JsonRpcClient, wallet: Wallet) -> str:
    try:
        signed = autofill_and_sign_compat(tx, client, wallet)
        tx_hash, _ = submit_and_wait_compat(signed, client)
    except Exception as exc:
        raise HTTPException(502, f"XRPL submission failed: {exc}") from exc
    if not tx_hash:
        raise HTTPException(502, "XRPL transaction returned no hash")
    return tx_hash


def create_faucet_wallet() -> Wallet:
    if XRPL_NETWORK.upper() not in FAUCET_NETWORKS:
        raise HTTPException(500, "Faucet is only allowed on TESTNET or DEVNET")

    client = _create_client()
    return generate_faucet_wallet(client, debug=False)


def wallet_to_wallet_send(
    *,
    sender_seed: str,
    sender_address: str,
    destination: str,
    amount_usd: float,
    dest_tag: Optional[int] = None,
    memos: Optional[Dict[str, str]] = None,
) -> str:
    if not sender_seed or not sender_address or not destination:
        raise HTTPException(400, "Missing sender or destination info")

    drops_amount = usd_to_xrp_drops(amount_usd)
    client = _create_client()
    wallet = Wallet.from_seed(seed=sender_seed)
    tx = Payment(
        account=sender_address,
        destination=destination,
        amount=str(drops_amount),
        destination_tag=dest_tag,
        memos=_encode_memos(memos),
    )
    return _submit_transaction(tx, client, wallet)


def onramp_via_faucet(
    destination: str,
    amount_usd: float,
    *,
    dest_tag: Optional[int] = None,
    memos: Optional[Dict[str, str]] = None,
) -> str:
    if not destination:
        raise HTTPException(400, "Missing destination")
    faucet = create_faucet_wallet()
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
    wallet = Wallet.create()
    return {
        "public_key": wallet.public_key,
        "private_key": wallet.private_key,
        "seed": wallet.seed,
    }
