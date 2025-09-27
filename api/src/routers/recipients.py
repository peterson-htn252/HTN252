import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from models import (
    BalanceOperation,
    RecipientCreate,
    RecipientUpdate,
    WalletLinkConfirm,
    WalletLinkStart,
)
from core.auth import get_current_ngo
from core.database import (
    TBL_ACCOUNTS,
    TBL_RECIPIENTS,
    TBL_WALLETS,
)
from core.xrpl import (
    derive_address_from_public_key,
    make_challenge,
    verify_challenge,
    create_new_wallet
)
from core.config import XRPL_NETWORK
from core.utils import now_iso
from core.wallet import (
    WalletDetails,
    ensure_balance,
    extract_wallet,
    send_usd,
)

router = APIRouter()


def _load_wallets(ngo_id: str, recipient: dict) -> tuple[WalletDetails, WalletDetails]:
    account = TBL_ACCOUNTS.get_item(Key={"ngo_id": ngo_id}).get("Item")
    if not account:
        raise HTTPException(status_code=500, detail="NGO account not found")

    ngo_wallet = extract_wallet(
        account,
        error_detail="Wallet keys not properly configured",
        status_code=500,
    )
    recipient_wallet = extract_wallet(
        recipient,
        error_detail="Wallet keys not properly configured",
        status_code=500,
    )
    return ngo_wallet, recipient_wallet


def _sanitize_recipient_item(item: dict) -> dict:
    sanitized = dict(item)
    sanitized.pop("private_key", None)
    sanitized.pop("seed", None)
    return sanitized


@router.post("/ngo/recipients", tags=["ngo", "recipients"])
def create_recipient(body: RecipientCreate, current_ngo: dict = Depends(get_current_ngo)):
    recipient_id = str(uuid.uuid4())
    ngo_id = current_ngo["ngo_id"]

    # Generate XRPL wallet keys
    try:
        wallet_keys = create_new_wallet()
        public_key = wallet_keys["public_key"]
        private_key = wallet_keys["private_key"]
        seed = wallet_keys["seed"]
        # Derive the address from the public key
        address = derive_address_from_public_key(public_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate XRPL wallet: {str(e)}") from e

    # Store recipient data according to SQL schema
    recipient_data = {
        "recipient_id": recipient_id,
        "ngo_id": ngo_id,
        "name": body.name,
        "location": body.location,
        "balance": 0.0,
        "public_key": public_key,
        "private_key": private_key,
        "address": address,
        "created_at": now_iso(),
        "seed": seed,
    }

    TBL_RECIPIENTS.put_item(Item=recipient_data)

    return {
        "recipient_id": recipient_id, 
        "status": "created",
        "public_key": public_key,
        "balance": 0.0
    }


@router.get("/ngo/recipients", tags=["ngo", "recipients"])
def list_recipients(current_ngo: dict = Depends(get_current_ngo), search: Optional[str] = None):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipients_resp = TBL_RECIPIENTS.scan(
            FilterExpression="ngo_id = :ngo_id",
            ExpressionAttributeValues={":ngo_id": ngo_id},
        )
        recipients = recipients_resp.get("Items", [])

        # Filter recipients if search term provided
        if search:
            search_lower = search.lower()
            recipients = [
                r for r in recipients
                if search_lower in r.get("name", "").lower()
                or search_lower in r.get("location", "").lower()
            ]

        sanitized = [_sanitize_recipient_item(recipient) for recipient in recipients]

        return {"recipients": sanitized, "count": len(sanitized)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}") from e


@router.get("/ngo/recipients/{recipient_id}", tags=["ngo", "recipients"])
def get_recipient(recipient_id: str, current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")

        return _sanitize_recipient_item(recipient)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}") from e


@router.put("/ngo/recipients/{recipient_id}", tags=["ngo", "recipients"])
def update_recipient(recipient_id: str, body: RecipientUpdate, current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")

        update_expr = "SET "
        expr_values = {}
        expr_names = {}
        updates = []

        if body.name is not None:
            updates.append("#name = :name")
            expr_values[":name"] = body.name
            expr_names["#name"] = "name"
        if body.location is not None:
            updates.append("#location = :location")
            expr_values[":location"] = body.location
            expr_names["#location"] = "location"

        if not updates:
            return {"status": "no updates"}

        update_expr += ", ".join(updates)

        TBL_RECIPIENTS.update_item(
            Key={"recipient_id": recipient_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names,
        )
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}") from e


@router.post("/ngo/recipients/{recipient_id}/balance", tags=["ngo", "recipients"])
def manage_recipient_balance(recipient_id: str, body: BalanceOperation, current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")

        current_balance = recipient.get("balance", 0.0)

        if body.operation_type == "withdraw" and current_balance < body.amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")

        ngo_wallet, recipient_wallet = _load_wallets(ngo_id, recipient)

        amount = float(body.amount)
        if body.operation_type == "deposit":
            ensure_balance(
                ngo_wallet.address,
                amount,
                entity="NGO",
                missing_detail="NGO wallet is not funded or could not fetch balance",
            )
            memo = body.description or f"Aid distribution to {recipient['name']}"
            tx_hash = send_usd(
                ngo_wallet,
                destination=recipient_wallet.address,
                amount=amount,
                memo=memo,
            )
            new_balance = current_balance + body.amount
        else:
            ensure_balance(
                recipient_wallet.address,
                amount,
                entity="recipient",
                missing_detail="Recipient wallet is not funded or could not fetch balance",
            )
            memo = body.description or f"Withdrawal from {recipient['name']}"
            tx_hash = send_usd(
                recipient_wallet,
                destination=ngo_wallet.address,
                amount=amount,
                memo=memo,
            )
            new_balance = current_balance - body.amount

        # Update the balance field in the recipients table
        TBL_RECIPIENTS.update_item(
            Key={"recipient_id": recipient_id},
            UpdateExpression="SET balance = :balance",
            ExpressionAttributeValues={
                ":balance": new_balance,
            },
        )
        return {
            "previous_balance": current_balance,
            "new_balance": new_balance,
            "operation": body.operation_type,
            "amount": body.amount,
            "tx_hash": tx_hash,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}") from e


@router.get("/recipients/{recipient_id}/balance", tags=["recipients"])
def get_recipient_balance(recipient_id: str):
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        return {
            "recipient_id": recipient_id,
            "balance": recipient.get("balance", 0.0)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}") from e


@router.get("/recipients/{recipient_id}", tags=["recipients"])
def get_recipient_public(recipient_id: str):
    """Get recipient details for payment terminal (no auth required)"""
    try:
        # Handle demo recipient cases
        if recipient_id in ["550e8400-e29b-41d4-a716-446655440000", "7c18326a-eafb-4f90-804c-6926baacb38a"]:
            return {
                "recipient_id": recipient_id,
                "name": "Demo Recipient",
                "balance": 100.0,  # Demo balance
                "verified": True,
                "created_at": "2024-01-01T00:00:00Z",
            }

        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        return {
            "recipient_id": recipient_id,
            "name": recipient.get("name"),
            "balance": recipient.get("balance", 0.0),
            "verified": recipient.get("verified", False),
            "created_at": recipient.get("created_at"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}") from e


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
