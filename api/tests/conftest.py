import os
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

# Provide a lightweight FastAPI stub for test environments where FastAPI
# is not installed. This satisfies imports like
# `from fastapi import HTTPException` used in core helpers.
if "fastapi" not in sys.modules:
    try:  # pragma: no cover - run only when FastAPI is available
        import fastapi  # type: ignore
    except Exception:  # pragma: no cover - fallback used in CI
        fastapi_stub = types.ModuleType("fastapi")

        class _HTTPException(Exception):
            def __init__(self, status_code: int, detail=None):
                self.status_code = status_code
                self.detail = detail
                message = detail if isinstance(detail, str) else str(detail)
                super().__init__(message)

        fastapi_stub.HTTPException = _HTTPException
        sys.modules["fastapi"] = fastapi_stub

# Ensure required environment variables are populated before importing the code under test.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "public-anon-key")
os.environ.setdefault("SECRET_KEY", "unit-test-secret")
os.environ.setdefault("XRPL_RPC_URL", "https://xrpl.invalid")
os.environ.setdefault("XRPL_NETWORK", "TESTNET")
os.environ.setdefault("XRPL_USD_RATE", "2.0")
