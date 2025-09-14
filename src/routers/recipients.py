import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from models import (
    RecipientCreate,
    RecipientUpdate,
    BalanceOperation,
    WalletLinkStart,
    WalletLinkConfirm,
    RecipientResponse,
)
from core.auth import get_current_ngo
from core.database import (
    TBL_RECIPIENTS,
    TBL_WALLETS,
)
from core.xrpl import make_challenge, verify_challenge, XRPL_AVAILABLE
from core.config import XRPL_NETWORK
from core.utils import now_iso

# Import XRPL wallet generation
if XRPL_AVAILABLE:
    from xrpl.wallet import Wallet as XRPLWallet

router = APIRouter()


@router.post("/ngo/recipients", tags=["ngo", "recipients"])
def create_recipient(body: RecipientCreate, current_ngo: dict = Depends(get_current_ngo)):
    recipient_id = str(uuid.uuid4())
    ngo_id = current_ngo["ngo_id"]
    
    # Generate XRPL wallet keys
    from core.xrpl import create_new_wallet, derive_address_from_public_key
    try:
        wallet_keys = create_new_wallet()
        public_key = wallet_keys["public_key"]
        private_key = wallet_keys["private_key"]
        # Derive the address from the public key
        address = derive_address_from_public_key(public_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate XRPL wallet: {str(e)}")
    
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
        
        # Don't include private_key in list responses for security
        for recipient in recipients:
            recipient.pop("private_key", None)
        
        return {"recipients": recipients, "count": len(recipients)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/ngo/recipients/{recipient_id}", tags=["ngo", "recipients"])
def get_recipient(recipient_id: str, current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        return recipient
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


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
        
        # Initialize tx_hash
        tx_hash = None
        
        if body.operation_type == "deposit":
            # Get NGO account details to access the wallet
            from core.database import TBL_ACCOUNTS
            account = TBL_ACCOUNTS.get_item(Key={"account_id": ngo_id}).get("Item")
            if not account:
                raise HTTPException(status_code=500, detail="NGO account not found")
            
            # Get wallet details
            ngo_public_key = account.get("public_key")
            ngo_private_key = account.get("private_key")
            recipient_public_key = recipient.get("public_key")
            
            if not ngo_public_key or not ngo_private_key or not recipient_public_key:
                raise HTTPException(status_code=500, detail="Wallet keys not properly configured")
            
            # Use stored addresses or derive from public keys
            from core.xrpl import (
                derive_address_from_public_key,
                fetch_xrp_balance_drops,
                convert_drops_to_usd,
                transfer_between_wallets,
            )

            ngo_address = account.get("address") or derive_address_from_public_key(ngo_public_key)
            recipient_address = recipient.get("address") or derive_address_from_public_key(recipient_public_key)
            
            if not ngo_address or not recipient_address:
                raise HTTPException(status_code=500, detail="Could not derive wallet addresses")
            
            # Check NGO wallet balance
            ngo_balance_drops = fetch_xrp_balance_drops(ngo_address)
            if ngo_balance_drops is None:
                raise HTTPException(status_code=400, detail="NGO wallet is not funded or could not fetch balance")
            
            ngo_balance_usd = convert_drops_to_usd(ngo_balance_drops)
            if ngo_balance_usd < body.amount:
                raise HTTPException(status_code=400, detail=f"Insufficient NGO wallet balance. Available: ${ngo_balance_usd:.2f}")
            
            # Perform wallet-to-wallet transfer
            memo = body.description or f"Aid distribution to {recipient['name']}"
            tx_hash = transfer_between_wallets(
                sender_seed=ngo_private_key,
                sender_address=ngo_address,
                recipient_address=recipient_address,
                amount_usd=body.amount,
                memo=memo
            )
            
            if not tx_hash:
                raise HTTPException(status_code=500, detail="Wallet transfer failed")
            
            new_balance = current_balance + body.amount
        else:
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
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


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
