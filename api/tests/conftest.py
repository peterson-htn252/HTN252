import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

# Ensure required environment variables are populated before importing the code under test.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "public-anon-key")
os.environ.setdefault("SECRET_KEY", "unit-test-secret")
os.environ.setdefault("XRPL_RPC_URL", "https://xrpl.invalid")
os.environ.setdefault("XRPL_NETWORK", "TESTNET")
os.environ.setdefault("XRPL_USD_RATE", "2.0")
