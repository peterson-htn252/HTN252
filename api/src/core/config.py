import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY")
if not SUPABASE_URL:
    raise RuntimeError("Missing SUPABASE_URL")

if not SUPABASE_PUBLISHABLE_KEY:
    raise RuntimeError("Missing SUPABASE_PUBLISHABLE_KEY")

XRPL_RPC_URL = os.getenv("XRPL_RPC_URL", "https://s.altnet.rippletest.net:51234")
XRPL_NETWORK = os.getenv("XRPL_NETWORK", "testnet")
OFFRAMP_DEPOSIT_ADDRESS = os.getenv("OFFRAMP_DEPOSIT_ADDRESS", "")
OFFRAMP_DEST_TAG = int(os.getenv("OFFRAMP_DEST_TAG", "0"))
XRPL_USD_RATE = float(os.getenv("XRPL_USD_RATE", "3.11"))  # Dev-only FX rate

JWT_SECRET = os.getenv("JWT_SECRET", "jwt-dev")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))
SECRET_KEY = os.getenv("APP_SECRET", "dev-secret")
FACE_EMBEDDING_KEY = os.getenv("FACE_EMBEDDING_KEY")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
XRPL_FALLBACK_ADDRESS = os.getenv("XRPL_HARDCODED_ADDRESS")

PERSONA_API_KEY = os.getenv("PERSONA_API_KEY")
PERSONA_TEMPLATE_ID = os.getenv("PERSONA_TEMPLATE_ID")
PERSONA_ENV = os.getenv("PERSONA_ENV", "sandbox")
PERSONA_API_VERSION = os.getenv("PERSONA_API_VERSION", "2023-01-05")
PERSONA_AVAILABLE = bool(PERSONA_TEMPLATE_ID)
