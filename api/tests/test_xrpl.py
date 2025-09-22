from decimal import Decimal, ROUND_DOWN

import pytest

from src.core import xrpl


def decode_memo_fields(memo):
    memo_type = bytes.fromhex(memo.memo_type).decode() if memo.memo_type else None
    memo_data = bytes.fromhex(memo.memo_data).decode() if memo.memo_data else None
    return memo_type, memo_data


def test_encode_memos_with_string():
    memos = xrpl._encode_memos("hello")
    assert memos is not None and len(memos) == 1
    memo_type, memo_data = decode_memo_fields(memos[0])
    assert memo_type == "text"
    assert memo_data == "hello"


def test_encode_memos_with_list():
    memos = xrpl._encode_memos(["alpha", "beta"])
    assert memos is not None and len(memos) == 2
    decoded = [decode_memo_fields(m) for m in memos]
    assert decoded == [("text", "alpha"), ("text", "beta")]


def test_encode_memos_with_dict():
    memos = xrpl._encode_memos({"purpose": "relief", "region": "americas"})
    assert memos is not None and len(memos) == 2
    decoded = sorted(decode_memo_fields(m) for m in memos)
    assert decoded == [("purpose", "relief"), ("region", "americas")]


def test_usd_to_xrp_drops_and_back():
    drops = xrpl.usd_to_xrp_drops(1)
    assert drops == 500000  # With XRPL_USD_RATE = 2.0 (configured in conftest)
    usd = xrpl.xrp_drops_to_usd(drops)
    assert usd == 1.0


def test_usd_to_xrp_drops_rejects_non_positive():
    with pytest.raises(ValueError):
        xrpl.usd_to_xrp_drops(0)


def test_xrp_drops_to_usd_rejects_negative():
    with pytest.raises(ValueError):
        xrpl.xrp_drops_to_usd(-1)


def test_get_quote_matches_expected_calculations():
    amount_minor = 12345
    quote = xrpl.get_quote("XRP", "USD", amount_minor)

    assert quote["from_currency"] == "XRP"
    assert quote["to_currency"] == "USD"
    assert quote["amount_minor"] == amount_minor

    price = xrpl.get_xrp_usd_price()
    amount_major = Decimal(amount_minor) / Decimal(100)
    expected_rate_ppm = int((price * Decimal(1_000_000)).to_integral_value(rounding=ROUND_DOWN))
    expected_deliver_min = int(
        (Decimal(amount_minor) * Decimal("0.99")).to_integral_value(rounding=ROUND_DOWN)
    )
    expected_send_max = int(
        ((amount_major / price) * xrpl.DROPS_PER_XRP * Decimal("1.01")).to_integral_value(
            rounding=ROUND_DOWN
        )
    )

    assert quote["rate_ppm"] == expected_rate_ppm
    assert quote["deliver_min"] == expected_deliver_min
    assert quote["send_max"] == expected_send_max


def test_make_and_verify_challenge(monkeypatch):
    monkeypatch.setattr(xrpl.time, "time", lambda: 1_700_000_000.0)
    challenge = xrpl.make_challenge("recipient-123", "rABC")
    assert xrpl.verify_challenge(challenge, "recipient-123", "rABC")
    assert not xrpl.verify_challenge(challenge, "recipient-999", "rABC")
    assert not xrpl.verify_challenge(challenge + "tamper", "recipient-123", "rABC")
