import uuid
from fastapi import APIRouter, HTTPException, Depends

from models import AccountCreate, AccountLogin, AccountToken
from core.auth import hash_password, verify_password, create_access_token, verify_token
from core.database import TBL_ACCOUNTS
from core.utils import now_iso

router = APIRouter()


@router.post("/accounts", tags=["accounts"])
def create_account(body: AccountCreate):
    account_id = str(uuid.uuid4())
    hashed_password = hash_password(body.password)
    ngo_id = body.ngo_id
    if body.account_type == "NGO" and not ngo_id:
        ngo_id = account_id
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


@router.post("/accounts/login", tags=["accounts"], response_model=AccountToken)
def login_account(body: AccountLogin):
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
            account_type=account["account_type"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/me", tags=["accounts"])
def get_current_account(current_user: dict = Depends(verify_token)):
    try:
        account = TBL_ACCOUNTS.get_item(Key={"account_id": current_user["sub"]}).get("Item")
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        account.pop("password_hash", None)
        return account
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
