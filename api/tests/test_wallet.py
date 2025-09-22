import pytest

from fastapi import HTTPException

from src.core import wallet


def test_resolve_classic_address_prefers_existing():
    record = {"address": "rExisting", "public_key": "ignored"}
    assert wallet.resolve_classic_address(record) == "rExisting"


def test_resolve_classic_address_derives_when_missing(monkeypatch):
    monkeypatch.setattr(wallet, "derive_address_from_public_key", lambda value: f"derived-{value}")
    record = {"public_key": "PUB123"}
    assert wallet.resolve_classic_address(record) == "derived-PUB123"


def test_resolve_classic_address_returns_none_without_fields(monkeypatch):
    monkeypatch.setattr(wallet, "derive_address_from_public_key", lambda value: None)
    assert wallet.resolve_classic_address({}) is None


def test_extract_wallet_uses_secret_and_derives_address(monkeypatch):
    monkeypatch.setattr(wallet, "derive_address_from_public_key", lambda value: "classic-address")
    record = {"seed": "s3cr3t", "public_key": "PUB"}
    details = wallet.extract_wallet(record, error_detail="missing wallet")
    assert details.seed == "s3cr3t"
    assert details.address == "classic-address"


def test_extract_wallet_accepts_alternate_secret_field(monkeypatch):
    monkeypatch.setattr(wallet, "derive_address_from_public_key", lambda value: "classic-address")
    record = {"private_key": "priv", "public_key": "PUB"}
    details = wallet.extract_wallet(record, error_detail="missing wallet")
    assert details.seed == "priv"


def test_extract_wallet_raises_when_secret_missing():
    record = {"public_key": "PUB"}
    with pytest.raises(HTTPException) as excinfo:
        wallet.extract_wallet(record, error_detail="missing wallet", status_code=422)
    assert excinfo.value.status_code == 422
    assert excinfo.value.detail == "missing wallet"


def test_extract_wallet_raises_when_address_cannot_be_resolved(monkeypatch):
    monkeypatch.setattr(wallet, "derive_address_from_public_key", lambda value: None)
    record = {"seed": "secret", "public_key": "PUB"}
    with pytest.raises(HTTPException) as excinfo:
        wallet.extract_wallet(record, error_detail="missing wallet")
    assert excinfo.value.detail == "Could not derive wallet address"


def test_get_wallet_balance_returns_none_when_unavailable(monkeypatch):
    monkeypatch.setattr(wallet, "fetch_xrp_balance_drops", lambda address: None)
    assert wallet.get_wallet_balance("rTest") is None


def test_get_wallet_balance_returns_details(monkeypatch):
    monkeypatch.setattr(wallet, "fetch_xrp_balance_drops", lambda address: 123456)
    monkeypatch.setattr(wallet, "xrp_drops_to_usd", lambda drops: 12.34)
    balance = wallet.get_wallet_balance("rTest")
    assert balance.address == "rTest"
    assert balance.balance_drops == 123456
    assert balance.balance_usd == 12.34


def test_ensure_balance_raises_when_balance_missing(monkeypatch):
    monkeypatch.setattr(wallet, "get_wallet_balance", lambda address: None)
    with pytest.raises(HTTPException) as excinfo:
        wallet.ensure_balance(
            "rTest",
            10.0,
            entity="NGO",
            missing_detail="balance unavailable",
            missing_status=404,
        )
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "balance unavailable"


def test_ensure_balance_raises_when_insufficient(monkeypatch):
    monkeypatch.setattr(
        wallet,
        "get_wallet_balance",
        lambda address: wallet.WalletBalance(address=address, balance_drops=100, balance_usd=5.0),
    )
    with pytest.raises(HTTPException) as excinfo:
        wallet.ensure_balance(
            "rTest",
            10.0,
            entity="NGO",
            missing_detail="balance unavailable",
            insufficient_status=409,
        )
    assert excinfo.value.status_code == 409
    assert "Insufficient" in excinfo.value.detail


def test_ensure_balance_returns_balance_when_sufficient(monkeypatch):
    expected = wallet.WalletBalance(address="rTest", balance_drops=2000000, balance_usd=20.0)
    monkeypatch.setattr(wallet, "get_wallet_balance", lambda address: expected)
    balance = wallet.ensure_balance(
        "rTest",
        10.0,
        entity="NGO",
        missing_detail="balance unavailable",
    )
    assert balance is expected


def test_send_usd_returns_transaction_hash(monkeypatch):
    calls = {}

    def fake_send(**kwargs):
        calls.update(kwargs)
        return "ABC123"

    monkeypatch.setattr(wallet, "wallet_to_wallet_send", fake_send)
    sender = wallet.WalletDetails(seed="seed", address="rSender")
    tx_hash = wallet.send_usd(sender, destination="rDest", amount=25.0, memo="aid disbursement")
    assert tx_hash == "ABC123"
    assert calls == {
        "sender_seed": "seed",
        "sender_address": "rSender",
        "destination": "rDest",
        "amount_usd": 25.0,
        "memos": ["aid disbursement"],
    }


def test_send_usd_raises_when_transfer_fails(monkeypatch):
    monkeypatch.setattr(wallet, "wallet_to_wallet_send", lambda **kwargs: "")
    sender = wallet.WalletDetails(seed="seed", address="rSender")
    with pytest.raises(HTTPException):
        wallet.send_usd(sender, destination="rDest", amount=25.0)


def test_balance_from_public_key_handles_missing(monkeypatch):
    assert wallet.balance_from_public_key(None) is None
    monkeypatch.setattr(wallet, "derive_address_from_public_key", lambda value: None)
    assert wallet.balance_from_public_key("PUB") is None


def test_balance_from_public_key_fetches_balance(monkeypatch):
    monkeypatch.setattr(wallet, "derive_address_from_public_key", lambda value: "classic-PUB")
    expected = wallet.WalletBalance(address="classic-PUB", balance_drops=1, balance_usd=0.01)
    monkeypatch.setattr(wallet, "get_wallet_balance", lambda address: expected)
    assert wallet.balance_from_public_key("PUB") is expected
