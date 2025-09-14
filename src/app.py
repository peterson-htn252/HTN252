"""
FastAPI APIs for NGO voucher system on XRPL (wallet-less stores) + Facial Recognition (InsightFace)
- Stores do NOT have wallets; they get fiat payouts via an off-ramp partner
- NGO has XRPL hot wallet (dev/test); recipients hold off-ledger balances (with optional XRPL link)
- Includes: NGO auth, recipients CRUD & balances, quotes, redeem, payouts, store payout methods,
  credentials (VC-JWT HMAC for dev), dashboard metrics, and facial embeddings enroll/identify

Notes:
- Supabase Postgres is used (service role in backend). Create tables from the schema I provided earlier.
- XRPL and signing are simplified for a hackathon; swap in real KMS/HSM for prod.
- InsightFace runs in CPU mode by default here.

Run:
  pip install fastapi uvicorn supabase insightface onnxruntime opencv-python-headless numpy passlib[bcrypt] pyjwt xrpl-py
  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... JWT_SECRET=... APP_SECRET=...
  uvicorn app:app --reload --port 8000
"""

import os
import json
import time
import uuid
import hmac
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal, List, Dict, Tuple

from dotenv import load_dotenv
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, conint, EmailStr
import jwt
from passlib.context import CryptContext
import numpy as np

# Optional: XRPL (testnet)
try:
    from xrpl.clients import JsonRpcClient
    from xrpl.wallet import Wallet
    from xrpl.models.transactions import Payment, Memo
    from xrpl.transaction import safe_sign_and_submit_transaction
    XRPL_AVAILABLE = True
except Exception:
    XRPL_AVAILABLE = False

FACE_AVAILABLE = False
_face_app = None

def get_face_app():
    """Lazy import to avoid crashing on incompatible NumPy/ONNX wheels."""
    global _face_app, FACE_AVAILABLE
    if _face_app is not None:
        return _face_app
    try:
        from insightface.app import FaceAnalysis  # imported here, not at module level
        _fa = FaceAnalysis(name="buffalo_l")
        _fa.prepare(ctx_id=-1, det_size=(640, 640))  # CPU
        _face_app = _fa
        FACE_AVAILABLE = True
        return _face_app
    except Exception as e:
        # Keep endpoints returning 503 instead of crashing the server
        FACE_AVAILABLE = False
        _face_app = None
        return None

load_dotenv()

# ------------------------------
# ENV & Supabase
# ------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# XRPL config (testnet by default)
XRPL_RPC_URL = os.getenv("XRPL_RPC_URL", "https://s.altnet.rippletest.net:51234")
XRPL_NETWORK = os.getenv("XRPL_NETWORK", "testnet")
NGO_HOT_SEED = os.getenv("NGO_HOT_SEED")       # DEV ONLY
NGO_HOT_ADDRESS = os.getenv("NGO_HOT_ADDRESS")   # DEV ONLY
OFFRAMP_DEPOSIT_ADDRESS = os.getenv("OFFRAMP_DEPOSIT_ADDRESS", "")
OFFRAMP_DEST_TAG = int(os.getenv("OFFRAMP_DEST_TAG", "0"))

# Auth
JWT_SECRET = os.getenv("JWT_SECRET", "jwt-dev")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))
SECRET_KEY = os.getenv("APP_SECRET", "dev-secret")  # for HMAC challenges & VC

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

app = FastAPI(title="XRPL Voucher APIs (Supabase + Face)", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------
# Supabase table wrapper (Dynamo-like)
# ------------------------------
class SupabaseTable:
    def __init__(self, client: Client, name: str):
        self.client = client
        self.name = name

    def get_item(self, Key: dict):
        q = self.client.table(self.name).select("*")
        for k, v in Key.items():
            q = q.eq(k, v)
        resp = q.single().execute()
        return {"Item": resp.data}

    def put_item(self, Item: dict):
        self.client.table(self.name).insert(Item).execute()

    def update_item(
        self,
        Key: dict,
        UpdateExpression: str = "",
        ExpressionAttributeValues: Optional[Dict[str, object]] = None,
        ExpressionAttributeNames: Optional[Dict[str, str]] = None,
    ):
        updates: Dict[str, object] = {}
        if UpdateExpression and ExpressionAttributeValues:
            expr = UpdateExpression.replace("SET", "").strip()
            parts = [p.strip() for p in expr.split(",")]
            for part in parts:
                if "=" in part:
                    field, value_key = [s.strip() for s in part.split("=")]
                    if field.startswith("#") and ExpressionAttributeNames:
                        field = ExpressionAttributeNames.get(field, field)
                    updates[field] = ExpressionAttributeValues.get(value_key)
        elif ExpressionAttributeValues:
            for k, v in ExpressionAttributeValues.items():
                updates[k.lstrip(":")] = v
        q = self.client.table(self.name).update(updates)
        for k, v in Key.items():
            q = q.eq(k, v)
        q.execute()

    def scan(
        self,
        FilterExpression: Optional[str] = None,
        ExpressionAttributeValues: Optional[Dict[str, object]] = None,
        ExpressionAttributeNames: Optional[Dict[str, str]] = None,
        ProjectionExpression: Optional[str] = None,
    ):
        sel = "*" if not ProjectionExpression else ProjectionExpression
        q = self.client.table(self.name).select(sel)
        if FilterExpression and ExpressionAttributeValues:
            for cond in [c.strip() for c in FilterExpression.split("AND")]:
                if "=" in cond:
                    attr, placeholder = [x.strip() for x in cond.split("=")]
                    if attr.startswith("#") and ExpressionAttributeNames:
                        attr = ExpressionAttributeNames.get(attr, attr)
                    val = ExpressionAttributeValues.get(placeholder)
                    q = q.eq(attr, val)
        resp = q.execute()
        return {"Items": resp.data}

# Tables
TBL_ACCOUNTS = SupabaseTable(supabase, os.getenv("ACCOUNTS_TABLE", "accounts"))
TBL_WALLETS = SupabaseTable(supabase, os.getenv("XRPL_WALLETS_TABLE", "xrpl_wallets"))
TBL_RECIP_BAL = SupabaseTable(supabase, os.getenv("RECIPIENT_BALANCES_TABLE", "recipient_balances"))
TBL_STORE_METHODS = SupabaseTable(supabase, os.getenv("STORE_PAYOUT_METHODS_TABLE", "store_payout_methods"))
TBL_PAYOUTS = SupabaseTable(supabase, os.getenv("PAYOUTS_TABLE", "payouts"))
TBL_MOVES = SupabaseTable(supabase, os.getenv("XRPL_MOVEMENTS_TABLE", "xrpl_movements"))
TBL_ISSUERS = SupabaseTable(supabase, os.getenv("ISSUERS_TABLE", "issuers"))
TBL_CREDS = SupabaseTable(supabase, os.getenv("CREDS_TABLE", "credentials"))
TBL_REVOKE = SupabaseTable(supabase, os.getenv("REVOKE_TABLE", "revocations"))

# NGO and financial tracking tables
TBL_NGOS = SupabaseTable(supabase, os.getenv("NGOS_TABLE", "ngos"))
TBL_PROGRAMS = SupabaseTable(supabase, os.getenv("PROGRAMS_TABLE", "programs"))
TBL_DONATIONS = SupabaseTable(supabase, os.getenv("DONATIONS_TABLE", "donations"))
TBL_EXPENSES = SupabaseTable(supabase, os.getenv("EXPENSES_TABLE", "expenses"))
TBL_RECIPIENTS = SupabaseTable(supabase, os.getenv("RECIPIENTS_TABLE", "recipients"))
TBL_FACE_MAPS = SupabaseTable(supabase, os.getenv("FACE_MAPS_TABLE", "face_maps"))

# ------------------------------
# Helpers & Auth
# ------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# JWT
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        ngo_id: str = payload.get("sub")
        if not ngo_id:
            raise HTTPException(401, "Invalid authentication credentials")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def get_current_ngo(token_data: dict = Depends(verify_token)) -> dict:
    ngo_id = token_data.get("sub")
    try:
        ngo = TBL_NGOS.get_item(Key={"ngo_id": ngo_id}).get("Item")
        if not ngo:
            raise HTTPException(status_code=404, detail="NGO not found")
        return ngo
    except Exception as e:
        raise HTTPException(status_code=500, detail="Database error")

# ------------------------------
# Models
# ------------------------------
AccountType = Literal["NGO", "RECIPIENT"]

class AccountCreate(BaseModel):
    account_type: AccountType
    status: Literal["active", "blocked"] = "active"
    name: str
    email: str
    password: str
    ngo_id: Optional[str] = None

class AccountLogin(BaseModel):
    email: str
    password: str

class WalletLinkStart(BaseModel):
    address: str

class WalletLinkConfirm(BaseModel):
    address: str
    signature: str

class QuoteRequest(BaseModel):
    from_currency: str = Field(..., examples=["XRP"])  # logical from
    to_currency: str = Field(..., examples=["PHP"])    # to fiat
    amount_minor: conint(gt=0)

class RedeemBody(BaseModel):
    voucher_id: str
    store_id: str
    recipient_id: str
    program_id: str
    amount_minor: conint(gt=0)
    currency: str

class StorePayoutMethod(BaseModel):
    method: Literal["bank_transfer", "mobile_money"]
    currency: str
    detail: Dict[str, str]

class StorePayoutBody(BaseModel):
    store_id: str
    program_id: str
    amount_minor: conint(gt=0)
    currency: str

Role = Literal["NGO", "STORE", "RECIPIENT", "DONOR"]
class VCIssue(BaseModel):
    issuer_did: str
    subject_wallet: Optional[str] = None
    subject_id: Optional[str] = None
    role: Role
    program_id: Optional[str] = None
    ttl_minutes: int = 365*24*60

class VCVerify(BaseModel):
    jwt: str

class VCRevoke(BaseModel):
    credential_id: str

class NGORegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    organization_name: str
    contact_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None

class NGOLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    ngo_id: str
    organization_name: str

class AccountToken(BaseModel):
    access_token: str
    token_type: str
    account_id: str
    account_type: str

# Recipient Models
class RecipientCreate(BaseModel):
    name: str
    location: str
    category: str = Field(..., examples=["Family Aid", "Medical Support", "Education", "Emergency Relief"])
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    program_id: str

class RecipientUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    status: Optional[Literal["active", "pending", "inactive"]] = None

class BalanceOperation(BaseModel):
    amount_minor: conint(gt=0)
    operation_type: Literal["deposit", "withdraw"]
    description: Optional[str] = None
    program_id: str

class DonationCreate(BaseModel):
    donor_name: str
    donor_email: Optional[EmailStr] = None
    amount_minor: conint(gt=0)
    currency: str = "USD"
    program_id: str
    description: Optional[str] = None

class ExpenseCreate(BaseModel):
    category: str = Field(..., examples=["Food Aid", "Medical Support", "Education", "Emergency Relief", "Infrastructure"])
    amount_minor: conint(gt=0)
    currency: str = "USD"
    program_id: str
    description: str
    recipient_id: Optional[str] = None

# ------------------------------
# Challenges & Quotes & XRPL helpers
# ------------------------------

def make_challenge(recipient_id: str, address: str) -> str:
    msg = f"link:{recipient_id}:{address}:{int(time.time()//300)}"
    mac = hmac.new(SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{mac}"

def verify_challenge(signature: str, recipient_id: str, address: str) -> bool:
    expected = make_challenge(recipient_id, address)
    return hmac.compare_digest(signature, expected)


def xrpl_client() -> Optional[JsonRpcClient]:
    if not XRPL_AVAILABLE:
        return None
    return JsonRpcClient(XRPL_RPC_URL)


def get_quote(from_currency: str, to_currency: str, amount_minor: int) -> dict:
    rate_ppm = 1_000_000
    deliver_min = amount_minor
    send_max = int(amount_minor * 1.003)
    return {
        "quote_id": str(uuid.uuid4()),
        "from_currency": from_currency,
        "to_currency": to_currency,
        "amount_minor": amount_minor,
        "rate_ppm": rate_ppm,
        "deliver_min_minor": deliver_min,
        "send_max_minor": send_max,
        "expires_at": int(time.time()) + 180,
    }


def to_drops(xrp_minor: int) -> int:
    return int(xrp_minor)


def pay_offramp_on_xrpl(amount_drops: int, memos: Dict[str, str]) -> str:
    if not XRPL_AVAILABLE:
        return "tx_placeholder_hash_no_xrpl"
    if not NGO_HOT_SEED or not NGO_HOT_ADDRESS:
        raise HTTPException(500, "NGO hot wallet not configured")
    client = xrpl_client()
    wallet = Wallet(seed=NGO_HOT_SEED, sequence=0)  # DEV ONLY
    memo_objs: List[Memo] = []
    for k, v in memos.items():
        memo_objs.append(Memo(memo_data=v.encode().hex(), memo_type=k.encode().hex()))
    dest = OFFRAMP_DEPOSIT_ADDRESS or NGO_HOT_ADDRESS
    tx = Payment(account=NGO_HOT_ADDRESS, destination=dest, amount=str(amount_drops), destination_tag=OFFRAMP_DEST_TAG or None, memos=memo_objs)
    resp = safe_sign_and_submit_transaction(tx, client, wallet)
    return resp.result.get("tx_json", {}).get("hash", "")

# Minor helpers

def to_drops(xrp_minor: int) -> int:
    """Treat minor units as drops for XRP in MVP (1 minor == 1 drop)."""
    return int(xrp_minor)

# ------------------------------
# Facial recognition endpoints
# ------------------------------

def _img_bytes_to_ndarray(data: bytes):
    import cv2
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Invalid image file")
    return img


def _best_face_embedding(img) -> Tuple[np.ndarray, dict]:
    appf = get_face_app()
    if appf is None:
        raise HTTPException(503, "InsightFace not available on server")
    faces = appf.get(img)
    if not faces:
        raise HTTPException(400, "No face detected")
    def area(f):
        x1, y1, x2, y2 = f.bbox.astype(int)
        return max(0, x2 - x1) * max(0, y2 - y1)
    faces.sort(key=area, reverse=True)
    f0 = faces[0]
    emb = getattr(f0, "normed_embedding", None)
    if emb is None:
        vec = f0.embedding.astype(np.float32)
        n = np.linalg.norm(vec) + 1e-12
        emb = (vec / n).astype(np.float32)
    meta = {"bbox": f0.bbox.tolist(), "det_score": float(getattr(f0, "det_score", 0))}
    return emb, meta


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))

@app.post("/face/enroll", tags=["face"])
async def face_enroll(
    account_id: str = Form(...),
    file: UploadFile = File(...),
    current_ngo: dict = Depends(get_current_ngo),
):
    if not FACE_AVAILABLE:
        return {"note": "InsightFace not installed on server"}
    data = await file.read()
    img = _img_bytes_to_ndarray(data)
    emb, meta = _best_face_embedding(img)

    row = {
        "face_id": str(uuid.uuid4()),
        "account_id": account_id,
        "ngo_id": current_ngo["ngo_id"],
        "embedding": json.dumps([float(x) for x in emb.tolist()]),
        "model": "buffalo_l",
        "meta": json.dumps(meta),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    TBL_FACE_MAPS.put_item(Item=row)
    return {"face_id": row["face_id"], "account_id": account_id}

@app.post("/face/identify", tags=["face"])
async def face_identify(
    file: UploadFile = File(...),
    top_k: int = 3,
    threshold: float = 0.40,
    current_ngo: dict = Depends(get_current_ngo),
):
    if not FACE_AVAILABLE:
        return {"note": "InsightFace not installed on server"}
    data = await file.read()
    img = _img_bytes_to_ndarray(data)
    emb_query, _ = _best_face_embedding(img)

    resp = TBL_FACE_MAPS.scan(
        FilterExpression="ngo_id = :ngo",
        ExpressionAttributeValues={":ngo": current_ngo["ngo_id"]}
    )
    items = resp.get("Items", []) or []

    scored = []
    for it in items:
        try:
            e = np.asarray(json.loads(it.get("embedding", "[]")), dtype=np.float32)
            if e.size != emb_query.size:
                continue
            score = _cosine(emb_query, e)
            scored.append({"account_id": it.get("account_id"), "face_id": it.get("face_id"), "score": score})                                                                               
        except Exception:
            continue

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[: max(1, top_k)]
    if not top or top[0]["score"] < threshold:
        return {"matches": []}
    return {"matches": top}

# ------------------------------
# Accounts & Recipients
# ------------------------------
@app.post("/accounts", tags=["accounts"])
def create_account(body: AccountCreate):
    account_id = str(uuid.uuid4())
    
    # Hash the password
    hashed_password = hash_password(body.password)
    
    # Generate ngo_id if account type is NGO and ngo_id is not provided
    ngo_id = body.ngo_id
    if body.account_type == "NGO" and not ngo_id:
        ngo_id = account_id  # Use account_id as ngo_id for NGO accounts
    
    TBL_ACCOUNTS.put_item(Item={
        "account_id": account_id,
        "account_type": body.account_type,
        "status": body.status,
        "email": body.email,
        "name": body.name,
        "password_hash": hashed_password,
        "ngo_id": ngo_id,
        "created_at": now_iso(),
    })
    return {"account_id": account_id}

@app.post("/accounts/login", tags=["accounts"], response_model=AccountToken)
def login_account(body: AccountLogin):
    """Login an existing account"""
    try:
        accounts = TBL_ACCOUNTS.scan(
            FilterExpression="email = :email",
            ExpressionAttributeValues={":email": body.email}
        ).get("Items", [])
        
        if not accounts:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        account = accounts[0]
        
        if not verify_password(body.password, account["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        if account.get("status") != "active":
            raise HTTPException(status_code=401, detail="Account is not active")
        
        access_token = create_access_token({"sub": account["account_id"], "email": account["email"]})
        
        return AccountToken(
            access_token=access_token,
            token_type="bearer",
            account_id=account["account_id"],
            account_type=account["account_type"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/accounts/me", tags=["accounts"])
def get_current_account(current_user: dict = Depends(verify_token)):
    """Get current account information"""
    try:
        account = TBL_ACCOUNTS.get_item(Key={"account_id": current_user["sub"]}).get("Item")
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        
        # Remove sensitive information
        account.pop("password_hash", None)
        return account
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ------------------------------
# Recipients Management (NGO Dashboard)
# ------------------------------
@app.post("/ngo/recipients", tags=["ngo", "recipients"])
def create_recipient(body: RecipientCreate, current_ngo: dict = Depends(get_current_ngo)):
    """Create a new aid recipient"""
    recipient_id = str(uuid.uuid4())
    ngo_id = current_ngo["ngo_id"]
    
    TBL_RECIPIENTS.put_item(Item={
        "recipient_id": recipient_id,
        "ngo_id": ngo_id,
        "name": body.name,
        "location": body.location,
        "category": body.category,
        "phone": body.phone,
        "email": body.email,
        "program_id": body.program_id,
        "status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    
    # Initialize balance at 0
    TBL_RECIP_BAL.put_item(Item={
        "recipient_id": recipient_id,
        "program_id": body.program_id,
        "amount_minor": 0,
        "last_updated": now_iso(),
    })
    
    return {"recipient_id": recipient_id, "status": "created"}

@app.get("/ngo/recipients", tags=["ngo", "recipients"])
def list_recipients(current_ngo: dict = Depends(get_current_ngo), search: Optional[str] = None):
    """List all recipients for the NGO"""
    ngo_id = current_ngo["ngo_id"]
    
    try:
        recipients_resp = TBL_RECIPIENTS.scan(
            FilterExpression="ngo_id = :ngo_id",
            ExpressionAttributeValues={":ngo_id": ngo_id}
        )
        recipients = recipients_resp.get("Items", [])
        
        # Add balance information
        enriched_recipients = []
        for recipient in recipients:
            # Get balance
            balance_resp = TBL_RECIP_BAL.get_item(
                Key={"recipient_id": recipient["recipient_id"], "program_id": recipient["program_id"]}
            )
            balance = balance_resp.get("Item", {}).get("amount_minor", 0)
            
            recipient_data = {
                **recipient,
                "wallet_balance": balance
            }
            enriched_recipients.append(recipient_data)
        
        # Apply search filter if provided
        if search:
            search_lower = search.lower()
            enriched_recipients = [
                r for r in enriched_recipients
                if search_lower in r.get("name", "").lower() or
                   search_lower in r.get("location", "").lower() or
                   search_lower in r.get("category", "").lower()
            ]
        
        return {"recipients": enriched_recipients, "count": len(enriched_recipients)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/ngo/recipients/{recipient_id}", tags=["ngo", "recipients"])
def get_recipient(recipient_id: str, current_ngo: dict = Depends(get_current_ngo)):
    """Get a specific recipient"""
    ngo_id = current_ngo["ngo_id"]
    
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        # Get balance
        balance_resp = TBL_RECIP_BAL.get_item(
            Key={"recipient_id": recipient_id, "program_id": recipient["program_id"]}
        )
        balance = balance_resp.get("Item", {}).get("amount_minor", 0)
        
        return {**recipient, "wallet_balance": balance}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.put("/ngo/recipients/{recipient_id}", tags=["ngo", "recipients"])
def update_recipient(recipient_id: str, body: RecipientUpdate, current_ngo: dict = Depends(get_current_ngo)):
    """Update a recipient"""
    ngo_id = current_ngo["ngo_id"]
    
    try:
        # Verify recipient belongs to NGO
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        # Build update expression
        update_expr = "SET updated_at = :updated_at"
        expr_values = {":updated_at": now_iso()}
        
        if body.name is not None:
            update_expr += ", #name = :name"
            expr_values[":name"] = body.name
        if body.location is not None:
            update_expr += ", #location = :location"
            expr_values[":location"] = body.location
        if body.category is not None:
            update_expr += ", category = :category"
            expr_values[":category"] = body.category
        if body.phone is not None:
            update_expr += ", phone = :phone"
            expr_values[":phone"] = body.phone
        if body.email is not None:
            update_expr += ", email = :email"
            expr_values[":email"] = body.email
        if body.status is not None:
            update_expr += ", #status = :status"
            expr_values[":status"] = body.status
        
        expr_names = {"#name": "name", "#location": "location", "#status": "status"}
        
        TBL_RECIPIENTS.update_item(
            Key={"recipient_id": recipient_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names
        )
        
        return {"status": "updated"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/ngo/recipients/{recipient_id}/balance", tags=["ngo", "recipients"])
def manage_recipient_balance(recipient_id: str, body: BalanceOperation, current_ngo: dict = Depends(get_current_ngo)):
    """Deposit or withdraw funds from recipient balance"""
    ngo_id = current_ngo["ngo_id"]
    
    try:
        # Verify recipient belongs to NGO
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        # Get current balance
        balance_resp = TBL_RECIP_BAL.get_item(
            Key={"recipient_id": recipient_id, "program_id": body.program_id}
        )
        current_balance = balance_resp.get("Item", {}).get("amount_minor", 0)
        
        if body.operation_type == "withdraw" and current_balance < body.amount_minor:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        
        # Calculate new balance
        if body.operation_type == "deposit":
            new_balance = current_balance + body.amount_minor
        else:  # withdraw
            new_balance = current_balance - body.amount_minor
        
        # Update balance
        TBL_RECIP_BAL.update_item(
            Key={"recipient_id": recipient_id, "program_id": body.program_id},
            UpdateExpression="SET amount_minor = :new_balance, last_updated = :updated",
            ExpressionAttributeValues={
                ":new_balance": new_balance,
                ":updated": now_iso()
            }
        )
        
        # Record as expense if deposit
        if body.operation_type == "deposit":
            TBL_EXPENSES.put_item(Item={
                "expense_id": str(uuid.uuid4()),
                "ngo_id": ngo_id,
                "category": "Aid Distribution",
                "amount_minor": body.amount_minor,
                "currency": "USD",
                "program_id": body.program_id,
                "description": body.description or f"Deposit to {recipient['name']}",
                "recipient_id": recipient_id,
                "created_at": now_iso(),
            })
        
        return {
            "previous_balance": current_balance,
            "new_balance": new_balance,
            "operation": body.operation_type,
            "amount": body.amount_minor
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/recipients/{recipient_id}/balance", tags=["recipients"])
def get_recipient_balance(recipient_id: str, program_id: str):
    r = TBL_RECIP_BAL.get_item(Key={"recipient_id": recipient_id, "program_id": program_id}).get("Item")
    return r or {"recipient_id": recipient_id, "program_id": program_id, "amount_minor": 0}

# ------------------------------
# Wallet link (optional non-custodial)
# ------------------------------
@app.post("/recipients/{recipient_id}/wallet-link/start", tags=["recipients"])
def wallet_link_start(recipient_id: str, body: WalletLinkStart):
    return {"challenge": make_challenge(recipient_id, body.address)}

@app.post("/recipients/{recipient_id}/wallet-link/confirm", tags=["recipients"])
def wallet_link_confirm(recipient_id: str, body: WalletLinkConfirm):
    if not verify_challenge(body.signature, recipient_id, body.address):
        raise HTTPException(401, "Invalid signature/challenge")
    wallet_id = str(uuid.uuid4())
    TBL_WALLETS.put_item(Item={
        "wallet_id": wallet_id,
        "owner_account_id": recipient_id,
        "role": "recipient",
        "classic_address": body.address,
        "custody": "non_custodial",
        "network": XRPL_NETWORK,
        "activation_status": "activated",
        "created_at": now_iso(),
    })
    return {"wallet_id": wallet_id, "address": body.address}

# ------------------------------
# Quotes & Redeem & Payouts
# ------------------------------
@app.post("/quotes", tags=["quotes"])
def create_quote(body: QuoteRequest):
    return get_quote(body.from_currency, body.to_currency, body.amount_minor)

@app.post("/redeem", tags=["redeem"])
def redeem(body: RedeemBody):
    bal = TBL_RECIP_BAL.get_item(Key={"recipient_id": body.recipient_id, "program_id": body.program_id}).get("Item")
    if not bal or bal.get("amount_minor", 0) < body.amount_minor:
        raise HTTPException(400, "Insufficient balance")
    quote = get_quote("XRP", body.currency, body.amount_minor)
    memos = {"voucher_id": body.voucher_id, "store_id": body.store_id, "program_id": body.program_id}
    tx_hash = pay_offramp_on_xrpl(to_drops(body.amount_minor), memos)
    payout_id = str(uuid.uuid4())
    TBL_PAYOUTS.put_item(Item={
        "payout_id": payout_id,
        "store_id": body.store_id,
        "program_id": body.program_id,
        "amount_minor": body.amount_minor,
        "currency": body.currency,
        "quote_id": quote["quote_id"],
        "xrpl_tx_hash": tx_hash,
        "offramp_ref": None,
        "status": "processing",
        "created_at": now_iso(),
    })
    TBL_RECIP_BAL.update_item(Key={"recipient_id": body.recipient_id, "program_id": body.program_id}, UpdateExpression="SET amount_minor = amount_minor - :a", ExpressionAttributeValues={":a": body.amount_minor})
    if tx_hash:
        TBL_MOVES.put_item(Item={
            "tx_hash": tx_hash,
            "classic_address": (NGO_HOT_ADDRESS or "ngo_hot_unknown"),
            "direction": "out",
            "delivered_currency": "XRP",
            "delivered_minor": to_drops(body.amount_minor),
            "memos": memos,
            "validated_ledger": 0,
            "occurred_at": now_iso(),
        })
    return {"payout_id": payout_id, "store_currency": body.currency, "amount_minor": body.amount_minor, "quote": quote, "xrpl_tx_hash": tx_hash, "status": "processing"}

@app.put("/stores/{store_id}/payout-method", tags=["stores"])
def upsert_store_payout_method(store_id: str, body: StorePayoutMethod):
    TBL_STORE_METHODS.put_item(Item={"store_id": store_id, "method": body.method, "currency": body.currency, "detail": body.detail, "updated_at": now_iso()})
    return {"ok": True}

@app.post("/payouts", tags=["payouts"])
def create_payout(body: StorePayoutBody):
    quote = get_quote("XRP", body.currency, body.amount_minor)
    memos = {"voucher_id": "batch", "store_id": body.store_id, "program_id": body.program_id}
    tx_hash = pay_offramp_on_xrpl(to_drops(body.amount_minor), memos)
    payout_id = str(uuid.uuid4())
    TBL_PAYOUTS.put_item(Item={
        "payout_id": payout_id,
        "store_id": body.store_id,
        "program_id": body.program_id,
        "amount_minor": body.amount_minor,
        "currency": body.currency,
        "quote_id": quote["quote_id"],
        "xrpl_tx_hash": tx_hash,
        "offramp_ref": None,
        "status": "processing",
        "created_at": now_iso(),
    })
    return {"payout_id": payout_id, "xrpl_tx_hash": tx_hash, "status": "processing"}

@app.get("/stores/{store_id}/payouts", tags=["stores"])
def list_store_payouts(store_id: str):
    res = TBL_PAYOUTS.scan()
    items = [p for p in res.get("Items", []) if p.get("store_id") == store_id]
    return {"items": items}

# ------------------------------
# Credentials (VC-JWT, HS256 dev)
# ------------------------------
class HS256Signer:
    @staticmethod
    def sign(header: dict, payload: dict) -> str:
        header_b64 = b64url(json.dumps(header, separators=(",", ":"), sort_keys=True).encode())
        payload_b64 = b64url(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
        to_sign = f"{header_b64}.{payload_b64}".encode()
        sig = hmac.new(SECRET_KEY.encode(), to_sign, hashlib.sha256).digest()
        return f"{header_b64}.{payload_b64}.{b64url(sig)}"

@app.post("/credentials/issue", tags=["credentials"])
def issue_vc(body: VCIssue):
    iat = int(time.time()); exp = iat + body.ttl_minutes * 60
    credential_id = f"urn:vc:{uuid.uuid4()}"
    payload = {
        "jti": credential_id,
        "iss": body.issuer_did,
        "sub": body.subject_wallet or body.subject_id or "subject",
        "iat": iat,
        "nbf": iat,
        "exp": exp,
        "vc": {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential", f"{body.role}Credential"],
            "credentialSubject": {
                "wallet": body.subject_wallet,
                "subject_id": body.subject_id,
                "role": body.role,
                "program_id": body.program_id,
            },
        },
    }
    header = {"alg": "HS256", "typ": "JWT", "kid": f"{body.issuer_did}#keys-1"}
    jwt_compact = HS256Signer.sign(header, payload)
    TBL_CREDS.put_item(Item={
        "credential_id": credential_id,
        "issuer_did": body.issuer_did,
        "role": body.role,
        "jwt": jwt_compact,
        "created_at": now_iso(),
        "expires_at": datetime.fromtimestamp(exp, tz=timezone.utc).isoformat(),
        "status": "active",
    })
    return {"credential_id": credential_id, "jwt": jwt_compact, "expires_at": exp}

@app.post("/credentials/verify", tags=["credentials"])
def verify_vc(jwt_token: VCVerify):
    try:
        header_b64, payload_b64, sig_b64 = jwt_token.jwt.split(".")
        to_sign = f"{header_b64}.{payload_b64}".encode()
        sig = base64.urlsafe_b64decode(sig_b64 + "==")
        calc = hmac.new(SECRET_KEY.encode(), to_sign, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, calc):
            raise HTTPException(401, "Invalid signature")
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=="))
    except Exception:
        raise HTTPException(400, "Malformed JWT")
    jti = payload.get("jti")
    rv = TBL_REVOKE.get_item(Key={"credential_id": jti}).get("Item")
    if rv:
        raise HTTPException(401, "Credential revoked")
    now_ts = int(time.time())
    if now_ts < payload.get("nbf", 0):
        raise HTTPException(401, "Not yet valid")
    if now_ts >= payload.get("exp", 0):
        raise HTTPException(401, "Expired")
    return {"valid": True, "payload": payload}

@app.post("/credentials/revoke", tags=["credentials"])
def revoke_vc(body: VCRevoke):
    TBL_REVOKE.put_item(Item={"credential_id": body.credential_id, "revoked_at": now_iso()})
    try:
        TBL_CREDS.update_item(Key={"credential_id": body.credential_id}, UpdateExpression="SET #s = :r", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":r": "revoked"})
    except Exception:
        pass
    return {"ok": True}

# ------------------------------
# NGO Authentication
# ------------------------------
@app.post("/auth/register", tags=["auth"], response_model=Token)
def register_ngo(body: NGORegister):
    """Register a new NGO organization"""
    # Check if email already exists
    try:
        existing = TBL_NGOS.scan(
            FilterExpression="email = :email",
            ExpressionAttributeValues={":email": body.email}
        ).get("Items", [])
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
    except Exception:
        pass
    
    ngo_id = str(uuid.uuid4())
    hashed_password = hash_password(body.password)
    
    # Create default program
    program_id = str(uuid.uuid4())
    
    TBL_NGOS.put_item(Item={
        "ngo_id": ngo_id,
        "email": body.email,
        "password_hash": hashed_password,
        "organization_name": body.organization_name,
        "contact_name": body.contact_name,
        "phone": body.phone,
        "address": body.address,
        "description": body.description,
        "status": "active",
        "default_program_id": program_id,
        "created_at": now_iso(),
    })
    
    # Create default program
    TBL_PROGRAMS.put_item(Item={
        "program_id": program_id,
        "ngo_id": ngo_id,
        "name": "General Aid Program",
        "description": "Default program for aid distribution",
        "currency": "USD",
        "status": "active",
        "created_at": now_iso(),
    })
    
    access_token = create_access_token({"sub": ngo_id, "email": body.email})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        ngo_id=ngo_id,
        organization_name=body.organization_name
    )

@app.post("/auth/login", tags=["auth"], response_model=Token)
def login_ngo(body: NGOLogin):
    """Login an existing NGO"""
    try:
        ngos = TBL_NGOS.scan(
            FilterExpression="email = :email",
            ExpressionAttributeValues={":email": body.email}
        ).get("Items", [])
        
        if not ngos:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        ngo = ngos[0]
        
        if not verify_password(body.password, ngo["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        if ngo.get("status") != "active":
            raise HTTPException(status_code=401, detail="Account is not active")
        
        access_token = create_access_token({"sub": ngo["ngo_id"], "email": ngo["email"]})
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            ngo_id=ngo["ngo_id"],
            organization_name=ngo["organization_name"]
        )
        
    except Exception:
        raise HTTPException(status_code=500, detail="Database error")

@app.get("/auth/me", tags=["auth"])
def get_current_user(current_ngo: dict = Depends(get_current_ngo)):
    """Get current NGO profile"""
    # Remove sensitive data
    safe_ngo = {k: v for k, v in current_ngo.items() if k != "password_hash"}
    return safe_ngo

# ------------------------------
# NGO Dashboard APIs
# ------------------------------
@app.get("/ngo/dashboard/stats", tags=["ngo"])
def get_dashboard_stats(current_ngo: dict = Depends(get_current_ngo)):
    """Get NGO dashboard statistics"""
    ngo_id = current_ngo["ngo_id"]
    
    try:
        # Count active recipients
        recipients_resp = TBL_RECIPIENTS.scan(
            FilterExpression="ngo_id = :ngo_id AND #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":ngo_id": ngo_id, ":status": "active"}
        )
        active_recipients = len(recipients_resp.get("Items", []))
        
        # Calculate total donations (last 30 days)
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        donations_resp = TBL_DONATIONS.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": thirty_days_ago}
        )
        total_donations = sum(item.get("amount_minor", 0) for item in donations_resp.get("Items", []))
        
        # Calculate total expenses (last 30 days)
        expenses_resp = TBL_EXPENSES.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": thirty_days_ago}
        )
        total_expenses = sum(item.get("amount_minor", 0) for item in expenses_resp.get("Items", []))
        
        # Calculate available funds
        available_funds = total_donations - total_expenses
        
        return {
            "active_recipients": active_recipients,
            "total_donations_30d": total_donations,
            "total_expenses_30d": total_expenses,
            "available_funds": available_funds,
            "utilization_rate": (total_expenses / total_donations * 100) if total_donations > 0 else 0,
            "last_updated": now_iso()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/ngo/dashboard/expense-breakdown", tags=["ngo"])
def get_expense_breakdown(current_ngo: dict = Depends(get_current_ngo)):
    """Get expense breakdown by category"""
    ngo_id = current_ngo["ngo_id"]
    
    try:
        # Get expenses from last 30 days
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        expenses_resp = TBL_EXPENSES.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": thirty_days_ago}
        )
        
        # Group by category
        category_totals = {}
        for expense in expenses_resp.get("Items", []):
            category = expense.get("category", "Other")
            amount = expense.get("amount_minor", 0)
            category_totals[category] = category_totals.get(category, 0) + amount
        
        # Format for frontend
        expense_data = [
            {"name": category, "value": amount}
            for category, amount in category_totals.items()
        ]
        
        return {"expense_breakdown": expense_data}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/ngo/dashboard/monthly-trends", tags=["ngo"])
def get_monthly_trends(current_ngo: dict = Depends(get_current_ngo)):
    """Get monthly donation and expense trends"""
    ngo_id = current_ngo["ngo_id"]
    
    try:
        # Get last 6 months of data
        six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
        
        # Get donations
        donations_resp = TBL_DONATIONS.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": six_months_ago.isoformat()}
        )
        
        # Get expenses
        expenses_resp = TBL_EXPENSES.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": six_months_ago.isoformat()}
        )
        
        # Group by month
        monthly_data = {}
        for i in range(6):
            month_date = datetime.now(timezone.utc) - timedelta(days=30*i)
            month_key = month_date.strftime("%b")
            monthly_data[month_key] = {"donations": 0, "expenses": 0}
        
        # Process donations
        for donation in donations_resp.get("Items", []):
            created_at = datetime.fromisoformat(donation["created_at"].replace("Z", "+00:00"))
            month_key = created_at.strftime("%b")
            if month_key in monthly_data:
                monthly_data[month_key]["donations"] += donation.get("amount_minor", 0)
        
        # Process expenses
        for expense in expenses_resp.get("Items", []):
            created_at = datetime.fromisoformat(expense["created_at"].replace("Z", "+00:00"))
            month_key = created_at.strftime("%b")
            if month_key in monthly_data:
                monthly_data[month_key]["expenses"] += expense.get("amount_minor", 0)
        
        # Format for frontend
        trends = [
            {"month": month, **data}
            for month, data in monthly_data.items()
        ]
        
        return {"monthly_trends": trends}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# ------------------------------
# Meta
# ------------------------------
@app.get("/healthz", tags=["meta"])
def healthz():
    return {"ok": True, "xrpl": XRPL_AVAILABLE, "face": FACE_AVAILABLE, "network": XRPL_NETWORK}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
