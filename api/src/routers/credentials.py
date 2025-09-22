import base64
import hmac
import hashlib
import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from models import VCIssue, VCVerify, VCRevoke
from core.utils import b64url, now_iso
from core.config import SECRET_KEY
from core.database import TBL_CREDS, TBL_REVOKE

router = APIRouter()


class HS256Signer:
    @staticmethod
    def sign(header: dict, payload: dict) -> str:
        header_b64 = b64url(json.dumps(header, separators=(",", ":"), sort_keys=True).encode())
        payload_b64 = b64url(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
        to_sign = f"{header_b64}.{payload_b64}".encode()
        sig = hmac.new(SECRET_KEY.encode(), to_sign, hashlib.sha256).digest()
        return f"{header_b64}.{payload_b64}.{b64url(sig)}"


@router.post("/credentials/issue", tags=["credentials"])
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


@router.post("/credentials/verify", tags=["credentials"])
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


@router.post("/credentials/revoke", tags=["credentials"])
def revoke_vc(body: VCRevoke):
    TBL_REVOKE.put_item(Item={"credential_id": body.credential_id, "revoked_at": now_iso()})
    try:
        TBL_CREDS.update_item(
            Key={"credential_id": body.credential_id},
            UpdateExpression="SET #s = :r",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":r": "revoked"},
        )
    except Exception:
        pass
    return {"ok": True}
