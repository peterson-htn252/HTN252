import uuid
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends

from models import AccountCreate, AccountLogin, AccountToken, NGOAccountSummary, RecipientCreate, RecipientUpdate, BalanceOperation
from core.auth import hash_password, verify_password, create_access_token, verify_token
from core.database import TBL_ACCOUNTS, TBL_RECIPIENTS, TBL_DONATIONS, TBL_EXPENSES, TBL_NGO_EXPENSES
from core.utils import now_iso
from core.xrpl import (
    derive_address_from_public_key,
    fetch_xrp_balance_drops,
    convert_drops_to_usd,
)

router = APIRouter()


@router.post("/accounts", tags=["accounts"])
def create_account(body: AccountCreate):
    account_id = body.account_id or str(uuid.uuid4())
    hashed_password = hash_password(body.password)
    ngo_id = body.ngo_id
    if body.account_type == "NGO" and not ngo_id:
        ngo_id = account_id
    # Generate XRPL wallet keys for the account
    from core.xrpl import create_new_wallet
    try:
        wallet_keys = create_new_wallet()
        public_key = wallet_keys["public_key"]
        private_key = wallet_keys["private_key"]
        address = derive_address_from_public_key(public_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate XRPL wallet: {str(e)}")
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
        "public_key": public_key,
        "private_key": private_key,
        "address": address,
        "created_at": now_iso(),
    })
    
    # Create NGO expense record if this is an NGO account
    if body.account_type == "NGO":
        TBL_NGO_EXPENSES.put_item(Item={
            "ngo_id": account_id,  # Use account_id as ngo_id for NGO accounts
            "expenses": 0.0,
            "created_at": now_iso(),
        })
    
    return {"account_id": account_id}


@router.post("/accounts/login", tags=["accounts"])
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
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "account_id": account["account_id"],
            "account_type": account["account_type"],
            "name": account["name"],
            "email": account["email"],
            "ngo_id": account.get("ngo_id")
        }
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
        # Lazily generate XRPL keys if missing (for legacy accounts)
        if not account.get("public_key") or not account.get("private_key"):
            from core.xrpl import create_new_wallet
            try:
                wallet_keys = create_new_wallet()
                public_key = wallet_keys["public_key"]
                private_key = wallet_keys["private_key"]
            except Exception:
                # Ultimate fallback
                public_key = f"pub_key_{account['account_id'][:8]}"
                private_key = f"priv_key_{account['account_id'][:8]}"
            # Persist and update local object
            TBL_ACCOUNTS.update_item(
                Key={"account_id": account["account_id"]},
                UpdateExpression="SET public_key = :pub, private_key = :priv",
                ExpressionAttributeValues={":pub": public_key, ":priv": private_key},
            )
            account["public_key"] = public_key
            account["private_key"] = private_key
        # Derive and persist address if missing
        if not account.get("address") and account.get("public_key"):
            addr = derive_address_from_public_key(account["public_key"])
            if addr:
                TBL_ACCOUNTS.update_item(
                    Key={"account_id": account["account_id"]},
                    UpdateExpression="SET address = :addr",
                    ExpressionAttributeValues={":addr": addr},
                )
                account["address"] = addr
        account.pop("password_hash", None)
        # Do not expose private key in API responses
        account.pop("private_key", None)
        # Ensure lifetime_donations is included, defaulting to 0 if not present
        if "lifetime_donations" not in account:
            account["lifetime_donations"] = 0
        # Ensure all fields expected by NGO dashboard are present
        # Normalize goal to an integer number of dollars (legacy data may be string)
        try:
            goal_val = account.get("goal")
            if isinstance(goal_val, str):
                account["goal"] = int(float(goal_val)) if goal_val.strip() else 0
            elif goal_val is None:
                account["goal"] = 0
            elif isinstance(goal_val, (int, float)):
                account["goal"] = int(goal_val)
        except Exception:
            account["goal"] = 0
        if "description" not in account:
            account["description"] = ""
        return account
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/ngos", tags=["accounts"], response_model=List[NGOAccountSummary])
def get_all_ngo_accounts():
    """
    Get all NGO accounts with their name, description, goal, and XRPL address.
    """
    try:
        response = TBL_ACCOUNTS.scan(
            FilterExpression="account_type = :account_type",
            ExpressionAttributeValues={":account_type": "NGO"}
        )

        ngo_accounts: List[NGOAccountSummary] = []
        for item in response.get("Items", []):
            # Safely derive an XRPL address from the stored public_key (may be None for legacy rows)
            try:
                xrpl_addr = None
                pub = item.get("public_key")
                if pub:
                    xrpl_addr = derive_address_from_public_key(pub)
            except Exception:
                xrpl_addr = None

            ngo_accounts.append(NGOAccountSummary(
                account_id=item["account_id"],
                name=item["name"],
                description=item.get("description", ""),
                goal=(
                    int(float(item.get("goal", 0)))
                    if isinstance(item.get("goal"), str)
                    else int(item.get("goal", 0) or 0)
                ),
                status=item["status"],
                lifetime_donations=item.get("lifetime_donations", 0),
                created_at=item["created_at"],
                xrpl_address=xrpl_addr,   # ✅ include it in the response
            ))

        return ngo_accounts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve NGO accounts: {str(e)}")


# Dashboard endpoints for NGO accounts
@router.get("/accounts/dashboard/stats", tags=["accounts", "dashboard"])
def get_dashboard_stats(current_user: dict = Depends(verify_token)):
    """Get dashboard statistics for the current NGO account"""
    try:
        account = TBL_ACCOUNTS.get_item(Key={"account_id": current_user["sub"]}).get("Item")
        if not account or account.get("account_type") != "NGO":
            raise HTTPException(status_code=403, detail="Access denied: NGO account required")
        
        ngo_id = account["account_id"]  # Use account_id as ngo_id
        
        # Get active recipients count - handle missing table gracefully
        try:
            recipients_resp = TBL_RECIPIENTS.scan(
                FilterExpression="ngo_id = :ngo_id AND #status = :status",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={":ngo_id": ngo_id, ":status": "active"},
            )
            active_recipients = len(recipients_resp.get("Items", []))
        except Exception:
            active_recipients = 0
        
        # Get total NGO expenses from the auditor table (external audit source)
        try:
            ngo_expense_resp = TBL_NGO_EXPENSES.get_item(Key={"ngo_id": ngo_id})
            total_expenses = int((ngo_expense_resp.get("Item", {}).get("expenses", 0.0)) * 100)  # Convert to minor units
        except Exception:
            total_expenses = 0  # Default to 0 if no record exists
        # Get available funds from wallet balance (primary source of truth)
        available_funds = 0
        try:
            public_key = account.get("public_key")
            addr = account.get("address")
            if not addr and public_key:
                addr = derive_address_from_public_key(public_key)
            if addr:
                drops = fetch_xrp_balance_drops(addr)
                # Treat unfunded (None) as 0 and still override
                drops_val = 0 if drops is None else drops
                usd = convert_drops_to_usd(drops_val)
                available_funds = int(round(usd * 100))
        except Exception:
            available_funds = 0

        # Get lifetime donations and goal from the current account
        lifetime_donations = account.get("lifetime_donations", 0)
        # Convert lifetime_donations to minor units (cents) if it's stored as dollars
        if isinstance(lifetime_donations, (int, float)) and lifetime_donations < 10000:
            # Assume it's in dollars if less than $100, convert to cents
            lifetime_donations_minor = int(lifetime_donations * 100)
        else:
            # Assume it's already in minor units
            lifetime_donations_minor = int(lifetime_donations)
        
        # Get goal in dollars
        goal = account.get("goal", 0)
        if isinstance(goal, str):
            try:
                goal = int(float(goal))
            except (ValueError, TypeError):
                goal = 0
        elif goal is None:
            goal = 0
        else:
            goal = int(goal)

        # Calculate utilization rate based on lifetime donations
        utilization_rate = (total_expenses / lifetime_donations_minor * 100) if lifetime_donations_minor > 0 else 0

        return {
            "active_recipients": active_recipients,
            "total_expenses": total_expenses,  # From auditor table
            "available_funds": available_funds,  # From wallet balance  
            "lifetime_donations": lifetime_donations_minor,  # Total raised ever (minor units)
            "goal": goal,  # Target amount (major units)
            "utilization_rate": utilization_rate,
            "last_updated": now_iso(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")



# Recipients endpoints for NGO accounts
@router.get("/accounts/recipients", tags=["accounts", "recipients"])
def list_recipients(current_user: dict = Depends(verify_token), search: Optional[str] = None):
    """List recipients for the current NGO account"""
    try:
        account = TBL_ACCOUNTS.get_item(Key={"account_id": current_user["sub"]}).get("Item")
        if not account or account.get("account_type") != "NGO":
            raise HTTPException(status_code=403, detail="Access denied: NGO account required")
        
        ngo_id = account["account_id"]
        
        try:
            recipients_resp = TBL_RECIPIENTS.scan(
                FilterExpression="ngo_id = :ngo_id",
                ExpressionAttributeValues={":ngo_id": ngo_id},
            )
            recipients = recipients_resp.get("Items", [])
            
            # Enrich with balance data
            enriched_recipients = recipients
            
            # Apply search filter if provided
            if search:
                search_lower = search.lower()
                enriched_recipients = [
                    r for r in enriched_recipients
                    if search_lower in r.get("name", "").lower()
                    or search_lower in r.get("location", "").lower()
                ]
        except Exception:
            # Return empty list if table doesn't exist
            enriched_recipients = []
        
        return {"recipients": enriched_recipients, "count": len(enriched_recipients)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/accounts/recipients", tags=["accounts", "recipients"])
def create_recipient(body: RecipientCreate, current_user: dict = Depends(verify_token)):
    """Create a new recipient for the current NGO account"""
    try:
        account = TBL_ACCOUNTS.get_item(Key={"account_id": current_user["sub"]}).get("Item")
        if not account or account.get("account_type") != "NGO":
            raise HTTPException(status_code=403, detail="Access denied: NGO account required")
        
        recipient_id = str(uuid.uuid4())
        ngo_id = account["account_id"]
        
        # Generate XRPL wallet keys
        from core.xrpl import create_new_wallet
        try:
            wallet_keys = create_new_wallet()
            public_key = wallet_keys["public_key"]
            private_key = wallet_keys["private_key"]
            # Derive the address from the public key
            address = derive_address_from_public_key(public_key)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate XRPL wallet: {str(e)}")
        
        TBL_RECIPIENTS.put_item(Item={
            "recipient_id": recipient_id,
            "ngo_id": ngo_id,
            "name": body.name,
            "location": body.location,
            "balance": 0.0,
            "public_key": public_key,
            "private_key": private_key,
            "address": address,
            "created_at": now_iso(),
        })
        
        return {"recipient_id": recipient_id, "status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/accounts/recipients/{recipient_id}/balance", tags=["accounts", "recipients"])
def manage_recipient_balance(recipient_id: str, body: BalanceOperation, current_user: dict = Depends(verify_token)):
    """Manage balance for a recipient (deposit/withdraw)"""
    try:
        account = TBL_ACCOUNTS.get_item(Key={"account_id": current_user["sub"]}).get("Item")
        if not account or account.get("account_type") != "NGO":
            raise HTTPException(status_code=403, detail="Access denied: NGO account required")
        
        ngo_id = account["account_id"]
        
        # Verify recipient belongs to this NGO
        recipient = TBL_RECIPIENTS.get_item(Key={"recipient_id": recipient_id}).get("Item")
        if not recipient or recipient.get("ngo_id") != ngo_id:
            raise HTTPException(status_code=404, detail="Recipient not found")
        
        # Get current balance
        current_balance = recipient.get("balance", 0.0)
        
        # Check for sufficient balance on withdrawal
        if body.operation_type == "withdraw" and current_balance < body.amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        
        # Initialize tx_hash
        tx_hash = None
        
        # Handle deposit operation with actual wallet transfer
        if body.operation_type == "deposit":
            # Get NGO wallet details
            ngo_public_key = account.get("public_key")
            ngo_private_key = account.get("private_key")
            recipient_public_key = recipient.get("public_key")
            
            if not ngo_public_key or not ngo_private_key or not recipient_public_key:
                raise HTTPException(status_code=500, detail="Wallet keys not properly configured")
            
            # Use stored addresses or derive from public keys
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
            from core.xrpl import transfer_between_wallets
            
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
            
            # Update local balance to reflect the transfer
            new_balance = current_balance + body.amount

            # Update balance in database
            TBL_RECIPIENTS.update_item(
                Key={"recipient_id": recipient_id},
                UpdateExpression="SET balance = :balance",
                ExpressionAttributeValues={
                    ":balance": new_balance,
                },
            )
        else:
            # Handle withdrawal - transfer money from recipient wallet back to NGO wallet
            # Get wallet details
            ngo_public_key = account.get("public_key")
            ngo_private_key = account.get("private_key")
            recipient_public_key = recipient.get("public_key")
            
            if not ngo_public_key or not ngo_private_key or not recipient_public_key:
                raise HTTPException(status_code=500, detail="Wallet keys not properly configured")
            
            # Use stored addresses or derive from public keys
            ngo_address = account.get("address") or derive_address_from_public_key(ngo_public_key)
            recipient_address = recipient.get("address") or derive_address_from_public_key(recipient_public_key)
            
            if not ngo_address or not recipient_address:
                raise HTTPException(status_code=500, detail="Could not derive wallet addresses")
            
            # Check recipient wallet balance
            recipient_balance_drops = fetch_xrp_balance_drops(recipient_address)
            if recipient_balance_drops is None:
                raise HTTPException(status_code=400, detail="Recipient wallet is not funded or could not fetch balance")
            
            recipient_balance_usd = convert_drops_to_usd(recipient_balance_drops)
            if recipient_balance_usd < body.amount:
                raise HTTPException(status_code=400, detail=f"Insufficient recipient wallet balance. Available: ${recipient_balance_usd:.2f}")
            
            # Perform wallet-to-wallet transfer from recipient to NGO
            memo = body.description or f"Withdrawal from {recipient['name']}"
            tx_hash = transfer_between_wallets(
                sender_seed=recipient.get("private_key"),
                sender_address=recipient_address,
                recipient_address=ngo_address,
                amount_usd=body.amount,
                memo=memo
            )
            
            if not tx_hash:
                raise HTTPException(status_code=500, detail="Wallet transfer failed")
            
            new_balance = current_balance - body.amount
        
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
