import uuid
from typing import List
from fastapi import APIRouter, HTTPException, Depends

from models import AccountCreate, AccountLogin, AccountToken, NGOAccountSummary
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
        "goal": body.goal,
        "description": body.description,
        "lifetime_donations": 0,
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
        # Ensure lifetime_donations is included, defaulting to 0 if not present
        if "lifetime_donations" not in account:
            account["lifetime_donations"] = 0
        return account
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/ngos", tags=["accounts"], response_model=List[NGOAccountSummary])
def get_all_ngo_accounts():
    """
    Get all NGO accounts with their name, description, and goal.
    Returns a list of NGO account summaries.
    """
    try:
        # Query all accounts with account_type = "NGO"
        response = TBL_ACCOUNTS.scan(
            FilterExpression="account_type = :account_type",
            ExpressionAttributeValues={":account_type": "NGO"}
        )
        
        ngo_accounts = []
        for item in response.get("Items", []):
            ngo_accounts.append(NGOAccountSummary(
                account_id=item["account_id"],
                name=item["name"],
                description=item.get("description", ""),
                goal=item.get("goal", ""),
                status=item["status"],
                lifetime_donations=item.get("lifetime_donations", 0),
                created_at=item["created_at"]
            ))
        
        return ngo_accounts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve NGO accounts: {str(e)}")
