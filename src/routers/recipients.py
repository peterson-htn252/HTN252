import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from models import (
    RecipientCreate,
    RecipientUpdate,
    BalanceOperation,
    WalletLinkStart,
    WalletLinkConfirm,
)
from core.auth import get_current_ngo
from core.database import (
    TBL_RECIPIENTS,
    TBL_RECIP_BAL,
    TBL_EXPENSES,
    TBL_WALLETS,
)
from core.xrpl import make_challenge, verify_challenge
from core.config import XRPL_NETWORK
from core.utils import now_iso

router = APIRouter()


@router.post("/ngo/recipients", tags=["ngo", "recipients"])
def create_recipient(body: RecipientCreate, current_ngo: dict = Depends(get_current_ngo)):
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
    TBL_RECIP_BAL.put_item(Item={
        "recipient_id": recipient_id,
        "program_id": body.program_id,
        "amount_minor": 0,
        "last_updated": now_iso(),
    })
    return {"recipient_id": recipient_id, "status": "created"}


@router.get("/ngo/recipients", tags=["ngo", "recipients"])
def list_recipients(current_ngo: dict = Depends(get_current_ngo), search: Optional[str] = None):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipients_resp = TBL_RECIPIENTS.scan(
            FilterExpression="ngo_id = :ngo_id",
            ExpressionAttributeValues={":ngo_id": ngo_id},
        )
        recipients = recipients_resp.get("Items", [])
        enriched_recipients = []
        for recipient in recipients:
            balance_resp = TBL_RECIP_BAL.get_item(
                Key={"recipient_id": recipient["recipient_id"], "program_id": recipient["program_id"]}
            )
            balance = balance_resp.get("Item", {}).get("amount_minor", 0)
            recipient_data = {**recipient, "wallet_balance": balance}
            enriched_recipients.append(recipient_data)
        if search:
            search_lower = search.lower()
            enriched_recipients = [
                r for r in enriched_recipients
                if search_lower in r.get("name", "").lower()
                or search_lower in r.get("location", "").lower()
                or search_lower in r.get("category", "").lower()
            ]
        return {"recipients": enriched_recipients, "count": len(enriched_recipients)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/ngo/recipients/{recipient_id}", tags=["ngo", "recipients"])
def get_recipient(recipient_id: str, current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")
        balance_resp = TBL_RECIP_BAL.get_item(
            Key={"recipient_id": recipient_id, "program_id": recipient["program_id"]}
        )
        balance = balance_resp.get("Item", {}).get("amount_minor", 0)
        return {**recipient, "wallet_balance": balance}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.put("/ngo/recipients/{recipient_id}", tags=["ngo", "recipients"])
def update_recipient(recipient_id: str, body: RecipientUpdate, current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")
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
            ExpressionAttributeNames=expr_names,
        )
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/ngo/recipients/{recipient_id}/balance", tags=["ngo", "recipients"])
def manage_recipient_balance(recipient_id: str, body: BalanceOperation, current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")
        balance_resp = TBL_RECIP_BAL.get_item(
            Key={"recipient_id": recipient_id, "program_id": body.program_id}
        )
        current_balance = balance_resp.get("Item", {}).get("amount_minor", 0)
        if body.operation_type == "withdraw" and current_balance < body.amount_minor:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        if body.operation_type == "deposit":
            new_balance = current_balance + body.amount_minor
        else:
            new_balance = current_balance - body.amount_minor
        TBL_RECIP_BAL.update_item(
            Key={"recipient_id": recipient_id, "program_id": body.program_id},
            UpdateExpression="SET amount_minor = :new_balance, last_updated = :updated",
            ExpressionAttributeValues={
                ":new_balance": new_balance,
                ":updated": now_iso(),
            },
        )
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
            "amount": body.amount_minor,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/recipients/{recipient_id}/balance", tags=["recipients"])
def get_recipient_balance(recipient_id: str, program_id: str):
    r = TBL_RECIP_BAL.get_item(Key={"recipient_id": recipient_id, "program_id": program_id}).get("Item")
    return r or {"recipient_id": recipient_id, "program_id": program_id, "amount_minor": 0}


@router.post("/recipients/{recipient_id}/wallet-link/start", tags=["recipients"])
def wallet_link_start(recipient_id: str, body: WalletLinkStart):
    return {"challenge": make_challenge(recipient_id, body.address)}


@router.post("/recipients/{recipient_id}/wallet-link/confirm", tags=["recipients"])
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
