from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Optional, Sequence

from fastapi import HTTPException

from .xrpl import (
    derive_address_from_public_key,
    fetch_xrp_balance_drops,
    wallet_to_wallet_send,
    xrp_drops_to_usd,
)


@dataclass(frozen=True)
class WalletDetails:
    """Minimal information required to submit XRPL transactions."""

    seed: str
    address: str


@dataclass(frozen=True)
class WalletBalance:
    """Simple structure describing an XRPL wallet balance."""

    address: str
    balance_drops: int
    balance_usd: float


_DEFAULT_SECRET_FIELDS: tuple[str, ...] = ("seed", "private_key")


def resolve_classic_address(
    record: Mapping[str, object],
    *,
    address_field: str = "address",
    public_key_field: str = "public_key",
) -> Optional[str]:
    """Return the classic address from a record, deriving it when necessary."""

    address = record.get(address_field)
    if isinstance(address, str) and address:
        return address
    public_key = record.get(public_key_field)
    if isinstance(public_key, str) and public_key:
        return derive_address_from_public_key(public_key)
    return None


def extract_wallet(
    record: Mapping[str, object],
    *,
    error_detail: str,
    status_code: int = 500,
    secret_fields: Sequence[str] = _DEFAULT_SECRET_FIELDS,
    public_key_field: str = "public_key",
    address_field: str = "address",
) -> WalletDetails:
    """Return :class:`WalletDetails` for the provided record or raise an HTTP error."""

    secret: Optional[str] = None
    for field in secret_fields:
        value = record.get(field)
        if isinstance(value, str) and value:
            secret = value
            break

    if not secret:
        raise HTTPException(status_code=status_code, detail=error_detail)

    address = resolve_classic_address(
        record,
        address_field=address_field,
        public_key_field=public_key_field,
    )
    if not address:
        raise HTTPException(status_code=status_code, detail="Could not derive wallet address")

    return WalletDetails(seed=secret, address=address)


def get_wallet_balance(address: str) -> Optional[WalletBalance]:
    """Fetch the XRPL balance for ``address``.

    Returns ``None`` when the balance could not be loaded (e.g. RPC failure).
    """

    drops = fetch_xrp_balance_drops(address)
    if drops is None:
        return None
    return WalletBalance(
        address=address,
        balance_drops=drops,
        balance_usd=xrp_drops_to_usd(drops),
    )


def ensure_balance(
    address: str,
    amount_required: float,
    *,
    entity: str,
    missing_detail: str,
    missing_status: int = 400,
    insufficient_status: int = 400,
) -> WalletBalance:
    """Ensure ``address`` holds at least ``amount_required`` USD worth of XRP."""

    balance = get_wallet_balance(address)
    if balance is None:
        raise HTTPException(status_code=missing_status, detail=missing_detail)

    if balance.balance_usd < amount_required:
        raise HTTPException(
            status_code=insufficient_status,
            detail=(
                f"Insufficient {entity} wallet balance. Available: ${balance.balance_usd:.2f}, "
                f"Required: ${amount_required:.2f}"
            ),
        )

    return balance


def send_usd(
    sender: WalletDetails,
    *,
    destination: str,
    amount: float,
    memo: Optional[str] = None,
) -> str:
    """Send ``amount`` USD worth of XRP from ``sender`` to ``destination``."""

    memos = [memo] if memo else None
    tx_hash = wallet_to_wallet_send(
        sender_seed=sender.seed,
        sender_address=sender.address,
        destination=destination,
        amount_usd=amount,
        memos=memos,
    )
    if not tx_hash:
        raise HTTPException(status_code=500, detail="Wallet transfer failed")
    return tx_hash


def balance_from_public_key(public_key: Optional[str]) -> Optional[WalletBalance]:
    """Helper that resolves a public key to a wallet balance."""

    if not public_key:
        return None
    address = derive_address_from_public_key(public_key)
    if not address:
        return None
    return get_wallet_balance(address)
