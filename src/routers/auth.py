import uuid
from fastapi import APIRouter, HTTPException, Depends

from models import NGORegister, NGOLogin, Token
from core.auth import hash_password, verify_password, create_access_token, get_current_ngo
from core.database import TBL_NGOS, TBL_PROGRAMS
from core.utils import now_iso

router = APIRouter()


@router.post("/auth/register", tags=["auth"], response_model=Token)
def register_ngo(body: NGORegister):
    try:
        existing = TBL_NGOS.scan(
            FilterExpression="email = :email",
            ExpressionAttributeValues={":email": body.email},
        ).get("Items", [])
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
    except Exception:
        pass
    ngo_id = str(uuid.uuid4())
    hashed_password = hash_password(body.password)
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
        organization_name=body.organization_name,
    )


@router.post("/auth/login", tags=["auth"], response_model=Token)
def login_ngo(body: NGOLogin):
    try:
        ngos = TBL_NGOS.scan(
            FilterExpression="email = :email",
            ExpressionAttributeValues={":email": body.email},
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
            organization_name=ngo["organization_name"],
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/auth/me", tags=["auth"])
def get_current_user(current_ngo: dict = Depends(get_current_ngo)):
    safe_ngo = {k: v for k, v in current_ngo.items() if k != "password_hash"}
    return safe_ngo
