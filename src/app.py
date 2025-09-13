"""
FastAPI APIs for NGO voucher system on XRPL (wallet-less stores)
- Stores do NOT have wallets; they get fiat payouts via an off-ramp partner
- NGO has XRPL cold + hot wallets
- Recipients hold off-ledger balances (with optional XRPL link for withdrawals)
- Includes credential issuing (VC-JWT), quotes, redeem, payouts, and basic indexing hooks

Notes:
- Replace XRPL + KMS placeholders with your actual implementations for production
- DynamoDB tables are assumed created as per earlier messages; env var names below
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

import boto3
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, conint

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
# ENV & AWS clients
# ------------------------------
REGION = os.getenv("AWS_REGION", "us-east-2")
dynamodb = boto3.resource("dynamodb", region_name=REGION)

TBL_ACCOUNTS = dynamodb.Table(os.getenv("ACCOUNTS_TABLE", "accounts"))
TBL_WALLETS = dynamodb.Table(os.getenv("XRPL_WALLETS_TABLE", "xrpl_wallets"))
TBL_RECIP_BAL = dynamodb.Table(os.getenv("RECIPIENT_BALANCES_TABLE", "recipient_balances"))
TBL_STORE_METHODS = dynamodb.Table(os.getenv("STORE_PAYOUT_METHODS_TABLE", "store_payout_methods"))
TBL_PAYOUTS = dynamodb.Table(os.getenv("PAYOUTS_TABLE", "payouts"))
TBL_MOVES = dynamodb.Table(os.getenv("XRPL_MOVEMENTS_TABLE", "xrpl_movements"))

# Credential tables
TBL_ISSUERS = dynamodb.Table(os.getenv("ISSUERS_TABLE", "issuers"))
TBL_CREDS = dynamodb.Table(os.getenv("CREDS_TABLE", "credentials"))
TBL_REVOKE = dynamodb.Table(os.getenv("REVOKE_TABLE", "revocations"))

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

app = FastAPI(title="XRPL Voucher APIs", version="0.1.0")

# ------------------------------
# Models
# ------------------------------
AccountType = Literal["NGO", "RECIPIENT", "STORE"]

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
# Health
# ------------------------------
@app.get("/healthz", tags=["meta"])
def healthz():
    return {"ok": True, "xrpl": XRPL_AVAILABLE, "network": XRPL_NETWORK}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)