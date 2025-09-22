from datetime import datetime, timezone

from src.core import utils


def test_now_iso_is_timezone_aware():
    iso_value = utils.now_iso()
    parsed = datetime.fromisoformat(iso_value)
    assert parsed.tzinfo is not None
    assert parsed.tzinfo.utcoffset(parsed) == timezone.utc.utcoffset(parsed)


def test_b64url_strips_padding():
    # ``+`` and ``/`` would be replaced with URL-safe variants and padding removed.
    encoded = utils.b64url(b"\xfb\xef")
    assert encoded == "--8"


def test_sha256_hex_matches_hashlib():
    expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    assert utils.sha256_hex(b"abc") == expected
