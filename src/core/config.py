import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

XRPL_RPC_URL = os.getenv("XRPL_RPC_URL", "https://s.altnet.rippletest.net:51234")
XRPL_NETWORK = os.getenv("XRPL_NETWORK", "testnet")
NGO_HOT_SEED = os.getenv("NGO_HOT_SEED")
NGO_HOT_ADDRESS = os.getenv("NGO_HOT_ADDRESS")
OFFRAMP_DEPOSIT_ADDRESS = os.getenv("OFFRAMP_DEPOSIT_ADDRESS", "")
OFFRAMP_DEST_TAG = int(os.getenv("OFFRAMP_DEST_TAG", "0"))

JWT_SECRET = os.getenv("JWT_SECRET", "jwt-dev")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))
SECRET_KEY = os.getenv("APP_SECRET", "dev-secret")
