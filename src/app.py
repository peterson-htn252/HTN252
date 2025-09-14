"""
FastAPI APIs for NGO voucher system on XRPL (wallet-less stores)
- Stores do NOT have wallets; they get fiat payouts via an off-ramp partner
- NGO has XRPL cold + hot wallets
- Recipients hold off-ledger balances (with optional XRPL link for withdrawals)
- Includes credential issuing (VC-JWT), quotes, redeem, payouts, and basic indexing hooks

Notes:
- Replace XRPL + KMS placeholders with your actual implementations for production
- Supabase tables are assumed created as per earlier messages; env var names below
- Error handling/logging kept concise for brevity
"""

import os
import json
import time
import uuid
import hmac
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal, List, Dict

from supabase import create_client, Client
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, conint, EmailStr
import jwt
from passlib.context import CryptContext

# Optional: install xrpl-py if you plan to hit XRPL testnet/mainnet
try:
    from xrpl.clients import JsonRpcClient
    from xrpl.wallet import Wallet
    from xrpl.models.transactions import Payment, Memo
    from xrpl.transaction import safe_sign_and_submit_transaction
    XRPL_AVAILABLE = True
except Exception:
    XRPL_AVAILABLE = False

# ------------------------------
# ENV & Supabase client
# ------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

ClientError = Exception


class SupabaseTable:
    def __init__(self, client: Client, name: str):
        self.client = client
        self.name = name

    def get_item(self, Key: dict):
        query = self.client.table(self.name).select("*")
        for k, v in Key.items():
            query = query.eq(k, v)
        resp = query.single().execute()
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
        query = self.client.table(self.name).update(updates)
        for k, v in Key.items():
            query = query.eq(k, v)
        query.execute()

    def scan(
        self,
        FilterExpression: Optional[str] = None,
        ExpressionAttributeValues: Optional[Dict[str, object]] = None,
        ExpressionAttributeNames: Optional[Dict[str, str]] = None,
        ProjectionExpression: Optional[str] = None,
    ):
        sel = "*" if not ProjectionExpression else ProjectionExpression
        query = self.client.table(self.name).select(sel)
        if FilterExpression and ExpressionAttributeValues:
            conditions = [c.strip() for c in FilterExpression.split("AND")]
            for cond in conditions:
                if "=" in cond:
                    attr, placeholder = [x.strip() for x in cond.split("=")]
                    if attr.startswith("#") and ExpressionAttributeNames:
                        attr = ExpressionAttributeNames.get(attr, attr)
                    val = ExpressionAttributeValues.get(placeholder)
                    query = query.eq(attr, val)
        resp = query.execute()
        return {"Items": resp.data}


TBL_ACCOUNTS = SupabaseTable(supabase, os.getenv("ACCOUNTS_TABLE", "accounts"))
TBL_WALLETS = SupabaseTable(supabase, os.getenv("XRPL_WALLETS_TABLE", "xrpl_wallets"))
TBL_RECIP_BAL = SupabaseTable(
    supabase, os.getenv("RECIPIENT_BALANCES_TABLE", "recipient_balances")
)
TBL_STORE_METHODS = SupabaseTable(
    supabase, os.getenv("STORE_PAYOUT_METHODS_TABLE", "store_payout_methods")
)
TBL_PAYOUTS = SupabaseTable(supabase, os.getenv("PAYOUTS_TABLE", "payouts"))
TBL_MOVES = SupabaseTable(
    supabase, os.getenv("XRPL_MOVEMENTS_TABLE", "xrpl_movements")
)

# Credential tables
TBL_ISSUERS = SupabaseTable(supabase, os.getenv("ISSUERS_TABLE", "issuers"))
TBL_CREDS = SupabaseTable(supabase, os.getenv("CREDS_TABLE", "credentials"))
TBL_REVOKE = SupabaseTable(supabase, os.getenv("REVOKE_TABLE", "revocations"))

# NGO and financial tracking tables
TBL_NGOS = SupabaseTable(supabase, os.getenv("NGOS_TABLE", "ngos"))
TBL_PROGRAMS = SupabaseTable(supabase, os.getenv("PROGRAMS_TABLE", "programs"))
TBL_DONATIONS = SupabaseTable(supabase, os.getenv("DONATIONS_TABLE", "donations"))
TBL_EXPENSES = SupabaseTable(supabase, os.getenv("EXPENSES_TABLE", "expenses"))
TBL_RECIPIENTS = SupabaseTable(supabase, os.getenv("RECIPIENTS_TABLE", "recipients"))

# XRPL config (testnet by default)
XRPL_RPC_URL = os.getenv("XRPL_RPC_URL", "https://s.altnet.rippletest.net:51234")
XRPL_NETWORK = os.getenv("XRPL_NETWORK", "testnet")

# NGO hot wallet seed ONLY for test/dev. In prod use KMS/HSM signer.
NGO_HOT_SEED = os.getenv("NGO_HOT_SEED")
NGO_HOT_ADDRESS = os.getenv("NGO_HOT_ADDRESS")

# Off-ramp partner config (placeholder)
OFFRAMP_DEPOSIT_ADDRESS = os.getenv("OFFRAMP_DEPOSIT_ADDRESS", "rOffRampDepositAddr...")
OFFRAMP_DEST_TAG = int(os.getenv("OFFRAMP_DEST_TAG", "12345"))

# Simple HMAC app secret for challenges (dev only)
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")

# JWT and password hashing setup
JWT_SECRET = os.getenv("JWT_SECRET", "jwt-secret-key")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

app = FastAPI(title="XRPL Voucher APIs", version="0.1.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------
# Models
# ------------------------------
AccountType = Literal["NGO", "RECIPIENT"]

class AccountCreate(BaseModel):
    account_type: AccountType
    status: Literal["active", "blocked"] = "active"

class WalletLinkStart(BaseModel):
    address: str

class WalletLinkConfirm(BaseModel):
    address: str
    signature: str  # signature over challenge string (client-side signing)

class QuoteRequest(BaseModel):
    from_currency: str = Field(..., examples=["XRP"])  # logical from (e.g., XRP)
    to_currency: str = Field(..., examples=["PHP"])
    amount_minor: conint(gt=0)  # integer minor units of from_currency

class RedeemBody(BaseModel):
    voucher_id: str
    store_id: str
    recipient_id: str
    program_id: str
    amount_minor: conint(gt=0)
    currency: str  # program currency (e.g., USD or PHP)

class StorePayoutMethod(BaseModel):
    method: Literal["bank_transfer", "mobile_money"]
    currency: str
    detail: Dict[str, str]

class StorePayoutBody(BaseModel):
    store_id: str
    program_id: str
    amount_minor: conint(gt=0)
    currency: str

# Credentials
Role = Literal["NGO", "STORE", "RECIPIENT", "DONOR"]
class VCIssue(BaseModel):
    issuer_did: str
    subject_wallet: Optional[str] = None  # optional for STORE if wallet-less
    subject_id: Optional[str] = None      # store_id / recipient_id / ngo_id
    role: Role
    program_id: Optional[str] = None
    ttl_minutes: int = 365*24*60

class VCVerify(BaseModel):
    jwt: str

class VCRevoke(BaseModel):
    credential_id: str

# NGO Authentication Models
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

# Financial Models
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
# Helpers
# ------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

# Challenge helpers (recipient wallet link)

def make_challenge(recipient_id: str, address: str) -> str:
    msg = f"link:{recipient_id}:{address}:{int(time.time()//300)}"  # 5-min window bucket
    mac = hmac.new(SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}:{mac}"

def verify_challenge(signature: str, recipient_id: str, address: str) -> bool:
    # In MVP we accept the HMAC itself as the "signature". For non-custodial, require real XRPL signature.
    expected = make_challenge(recipient_id, address)
    return hmac.compare_digest(signature, expected)

# XRPL client (lazy)

def xrpl_client() -> Optional[JsonRpcClient]:
    if not XRPL_AVAILABLE:
        return None
    return JsonRpcClient(XRPL_RPC_URL)

# Placeholder pathfind (return fixed slippage guard)

def get_quote(from_currency: str, to_currency: str, amount_minor: int) -> dict:
    # In production: call XRPL pathfind and compute SendMax/DeliverMin
    rate_ppm = 1000000  # 1:1 for placeholder
    deliver_min = amount_minor  # naive
    send_max = int(amount_minor * 1.003)  # +30 bps slippage
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

# XRPL payment submission (NGO hot wallet → off-ramp). Returns tx hash.

def pay_offramp_on_xrpl(amount_drops: int, memos: Dict[str, str]) -> str:
    if not XRPL_AVAILABLE:
        return "tx_placeholder_hash_no_xrpl"
    if not NGO_HOT_SEED or not NGO_HOT_ADDRESS:
        raise HTTPException(500, "NGO hot wallet not configured")

    client = xrpl_client()
    wallet = Wallet(seed=NGO_HOT_SEED, sequence=0)  # for dev only; use proper sequence mgmt
    memo_objs: List[Memo] = []
    for k, v in memos.items():
        # XRPL memos require hex encoding
        key_hex = v.encode().hex()
        type_hex = k.encode().hex()
        memo_objs.append(Memo(memo_data=key_hex, memo_type=type_hex))

    tx = Payment(
        account=NGO_HOT_ADDRESS,
        destination=OFFRAMP_DEPOSIT_ADDRESS,
        amount=str(amount_drops),
        destination_tag=OFFRAMP_DEST_TAG,
        memos=memo_objs,
    )
    resp = safe_sign_and_submit_transaction(tx, client, wallet)
    return resp.result.get("tx_json", {}).get("hash", "")

# Minor helpers

def to_drops(xrp_minor: int) -> int:
    """Treat minor units as drops for XRP in MVP (1 minor == 1 drop)."""
    return int(xrp_minor)

# Authentication helpers

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        ngo_id: str = payload.get("sub")
        if ngo_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_ngo(token_data: dict = Depends(verify_token)) -> dict:
    ngo_id = token_data.get("sub")
    try:
        ngo = TBL_NGOS.get_item(Key={"ngo_id": ngo_id}).get("Item")
        if not ngo:
            raise HTTPException(status_code=404, detail="NGO not found")
        return ngo
    except ClientError:
        raise HTTPException(status_code=500, detail="Database error")

# ------------------------------
# Accounts & recipient balances
# ------------------------------
@app.post("/accounts", tags=["accounts"])
def create_account(body: AccountCreate):
    account_id = str(uuid.uuid4())
    TBL_ACCOUNTS.put_item(Item={
        "account_id": account_id,
        "account_type": body.account_type,
        "status": body.status,
        "created_at": now_iso(),
    })
    return {"account_id": account_id}

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
        
    except ClientError as e:
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
        
    except ClientError as e:
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
        
    except ClientError as e:
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
        
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/recipients/{recipient_id}/balance", tags=["recipients"])
def get_recipient_balance(recipient_id: str, program_id: str):
    r = TBL_RECIP_BAL.get_item(Key={"recipient_id": recipient_id, "program_id": program_id}).get("Item")
    return r or {"recipient_id": recipient_id, "program_id": program_id, "amount_minor": 0}

# ------------------------------
# Recipient wallet link (optional non-custodial)
# ------------------------------
@app.post("/recipients/{recipient_id}/wallet-link/start", tags=["recipients"])
def wallet_link_start(recipient_id: str, body: WalletLinkStart):
    challenge = make_challenge(recipient_id, body.address)
    return {"challenge": challenge}

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
# Quotes
# ------------------------------
@app.post("/quotes", tags=["quotes"])
def create_quote(body: QuoteRequest):
    q = get_quote(body.from_currency, body.to_currency, body.amount_minor)
    return q

# ------------------------------
# Redeem (store has no wallet; payout via off-ramp)
# ------------------------------
@app.post("/redeem", tags=["redeem"])
def redeem(body: RedeemBody):
    # 1) Load recipient balance
    bal = TBL_RECIP_BAL.get_item(Key={"recipient_id": body.recipient_id, "program_id": body.program_id}).get("Item")
    if not bal or bal.get("amount_minor", 0) < body.amount_minor:
        raise HTTPException(400, "Insufficient balance")

    # 2) Policy checks would be here (caps, category, geo, hours, credentials)

    # 3) Get quote for NGO hot → off-ramp (simplified to same-currency XRP in MVP)
    quote = get_quote("XRP", body.currency, body.amount_minor)

    # 4) XRPL payment to off-ramp (amount as drops in MVP)
    memos = {"voucher_id": body.voucher_id, "store_id": body.store_id, "program_id": body.program_id}
    tx_hash = pay_offramp_on_xrpl(to_drops(body.amount_minor), memos)

    # 5) Record payout and movement; debit recipient balance
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

    # Debit balance (optimistic)
    TBL_RECIP_BAL.update_item(
        Key={"recipient_id": body.recipient_id, "program_id": body.program_id},
        UpdateExpression="SET amount_minor = amount_minor - :amt",
        ExpressionAttributeValues={":amt": body.amount_minor},
    )

    # Movement index (optional minimal)
    if tx_hash:
        TBL_MOVES.put_item(Item={
            "tx_hash": tx_hash,
            "classic_address": NGO_HOT_ADDRESS or "ngo_hot_unknown",
            "direction": "out",
            "delivered_currency": "XRP",
            "delivered_minor": to_drops(body.amount_minor),
            "memos": memos,
            "validated_ledger": 0,
            "occurred_at": now_iso(),
        })

    return {
        "payout_id": payout_id,
        "store_currency": body.currency,
        "amount_minor": body.amount_minor,
        "quote": quote,
        "xrpl_tx_hash": tx_hash,
        "status": "processing",
    }

# ------------------------------
# Store payout methods & manual payouts (batch/console)
# ------------------------------
@app.put("/stores/{store_id}/payout-method", tags=["stores"])
def upsert_store_payout_method(store_id: str, body: StorePayoutMethod):
    TBL_STORE_METHODS.put_item(Item={
        "store_id": store_id,
        "method": body.method,
        "currency": body.currency,
        "detail": body.detail,
        "updated_at": now_iso(),
    })
    return {"ok": True}

@app.post("/payouts", tags=["payouts"])
def create_payout(body: StorePayoutBody):
    # This mimics redeem() but without a voucher/recipient, used for batch settlements
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
    # In a real design, payouts table should use a GSI on store_id for efficient queries. Here we scan for brevity.
    resp = TBL_PAYOUTS.scan()
    items = [p for p in resp.get("Items", []) if p.get("store_id") == store_id]
    return {"items": items}

# ------------------------------
# Credential issuing (VC-JWT minimal, HMAC signing for dev)
# ------------------------------
# For dev: we sign JWT with HMAC-SHA256 using SECRET_KEY. In prod: swap to ES256K with KMS.

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
    iat = int(time.time())
    exp = iat + body.ttl_minutes * 60
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
def verify_vc(body: VCVerify):
    try:
        header_b64, payload_b64, sig_b64 = body.jwt.split(".")
        to_sign = f"{header_b64}.{payload_b64}".encode()
        sig = base64.urlsafe_b64decode(sig_b64 + "==")
        calc = hmac.new(SECRET_KEY.encode(), to_sign, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, calc):
            raise HTTPException(401, "Invalid signature")
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=="))
    except Exception:
        raise HTTPException(400, "Malformed JWT")

    # Revocation check
    jti = payload.get("jti")
    rv = TBL_REVOKE.get_item(Key={"credential_id": jti}).get("Item")
    if rv:
        raise HTTPException(401, "Credential revoked")

    now = int(time.time())
    if now < payload.get("nbf", 0):
        raise HTTPException(401, "Not yet valid")
    if now >= payload.get("exp", 0):
        raise HTTPException(401, "Expired")

    return {"valid": True, "payload": payload}

@app.post("/credentials/revoke", tags=["credentials"])
def revoke_vc(body: VCRevoke):
    TBL_REVOKE.put_item(Item={"credential_id": body.credential_id, "revoked_at": now_iso()})
    try:
        TBL_CREDS.update_item(
            Key={"credential_id": body.credential_id},
            UpdateExpression="SET #s = :rev",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":rev": "revoked"},
        )
    except ClientError:
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
    except ClientError:
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
        
    except ClientError:
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
        
    except ClientError as e:
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
        
    except ClientError as e:
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
        
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# ------------------------------
# Health
# ------------------------------
@app.get("/healthz", tags=["meta"])
def healthz():
    return {"ok": True, "xrpl": XRPL_AVAILABLE, "network": XRPL_NETWORK}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)