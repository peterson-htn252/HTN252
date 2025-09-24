# routes/accounts.py
import asyncio
import os
import traceback
import uuid
from decimal import Decimal, ROUND_DOWN
from typing import List, Optional, Tuple, Dict, Any

import jwt
from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect

from supabase import create_client, Client

from models import (
    AccountCreate,
    AccountLogin,
    NGOAccountSummary,
    RecipientCreate,
    BalanceOperation,
)
from core.auth import hash_password, verify_password, create_access_token, verify_token
from core.config import JWT_ALGORITHM, JWT_SECRET
from core.utils import now_iso
from core.xrpl import derive_address_from_public_key, create_new_wallet
from core.wallet import (
    balance_from_public_key,
    ensure_balance,
    extract_wallet,
    get_wallet_balance,
    send_usd,
)

# -----------------------------------------------------------------------------
# Supabase client
# -----------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv(
    "SUPABASE_ANON_KEY"
)

if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
    raise RuntimeError("Missing Supabase configuration")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

router = APIRouter()

# Table names
TBL_ACCOUNTS = "accounts"
TBL_RECIPIENTS = "recipients"
TBL_NGO_EXPENSES = "ngo_expenses"


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _usd(amount: Any, positive: bool = True) -> Decimal:
    """Parse to Decimal USD, round to cents, and validate sign."""
    try:
        d = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid amount") from exc
    if positive and d <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    return d


def _get_account_by_id(account_id: str) -> Dict[str, Any]:
    res = (
        supabase.table(TBL_ACCOUNTS)
        .select("*")
        .eq("account_id", account_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    return rows[0]


def _get_account_by_email(email: str) -> Optional[Dict[str, Any]]:
    res = (
        supabase.table(TBL_ACCOUNTS)
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def _get_recipient_by_id(recipient_id: str) -> Dict[str, Any]:
    res = (
        supabase.table(TBL_RECIPIENTS)
        .select("*")
        .eq("recipient_id", recipient_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Recipient not found")
    return rows[0]


def _wallet_usd(address: str) -> Decimal:
    if not address:
        return Decimal("0.00")
    summary = get_wallet_balance(address)
    if summary is None:
        return Decimal("0.00")
    usd = Decimal(str(summary.balance_usd))
    return usd.quantize(Decimal("0.01"), rounding=ROUND_DOWN)


def _sanitize_account_response(acc: Dict[str, Any]) -> Dict[str, Any]:
    acc = dict(acc)
    acc.pop("password_hash", None)
    acc.pop("private_key", None)
    # goal normalized to int dollars
    try:
        goal = acc.get("goal", 0)
        if isinstance(goal, str):
            acc["goal"] = int(float(goal)) if goal.strip() else 0
        elif goal is None:
            acc["goal"] = 0
        else:
            acc["goal"] = int(goal)
    except Exception:
        acc["goal"] = 0
    if "lifetime_donations" not in acc:
        acc["lifetime_donations"] = 0
    if "description" not in acc:
        acc["description"] = ""
    return acc


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@router.post("/accounts", tags=["accounts"])
def create_account(body: AccountCreate):
    """Create an account and generate an XRPL wallet."""
    account_id = body.account_id or str(uuid.uuid4())
    hashed_password = hash_password(body.password)
    ngo_id = body.ngo_id
    if body.account_type == "NGO" and not ngo_id:
        ngo_id = account_id

    try:
        wallet = create_new_wallet()
        public_key = wallet["public_key"]
        private_key = wallet["private_key"]
        seed = wallet["seed"]
        address = derive_address_from_public_key(public_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate XRPL wallet: {e}") from e

    data = {
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
        "seed": seed,
    }

    # Insert account
    try:
        supabase.table(TBL_ACCOUNTS).insert(data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Account creation failed: {e}") from e

    # If NGO, ensure an expense row exists
    if body.account_type == "NGO":
        try:
            supabase.table(TBL_NGO_EXPENSES).insert(
                {"ngo_id": account_id, "expenses": 0.0, "created_at": now_iso()}
            ).execute()
        except Exception:
            # ignore if it already exists or table is not set up
            pass

    return {"account_id": account_id}


@router.post("/accounts/login", tags=["accounts"])
def login_account(body: AccountLogin):
    """Login with email and password."""
    try:
        account = _get_account_by_email(body.email)
        if not account or not verify_password(body.password, account["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if account.get("status") != "active":
            raise HTTPException(status_code=401, detail="Account is not active")

        token = create_access_token({"sub": account["account_id"], "email": account["email"]})
        return {
            "access_token": token,
            "token_type": "bearer",
            "account_id": account["account_id"],
            "account_type": account["account_type"],
            "name": account["name"],
            "email": account["email"],
            "ngo_id": account.get("ngo_id"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/accounts/me", tags=["accounts"])
def get_current_account(current_user: dict = Depends(verify_token)):
    """Return the current account. Lazily backfill XRPL keys and address if missing."""
    try:
        account = _get_account_by_id(current_user["sub"])

        # Backfill wallet if legacy
        need_update = False
        if not account.get("public_key") or not account.get("private_key"):
            try:
                wallet = create_new_wallet()
                account["public_key"] = wallet["public_key"]
                account["private_key"] = wallet["private_key"]
                account["seed"] = wallet["seed"]
                need_update = True
            except Exception:
                # As a last resort keep it unchanged
                pass

        if not account.get("address") and account.get("public_key"):
            try:
                account["address"] = derive_address_from_public_key(account["public_key"])
                need_update = True
            except Exception:
                pass

        if need_update:
            try:
                supabase.table(TBL_ACCOUNTS).update(
                    {
                        "public_key": account.get("public_key"),
                        "private_key": account.get("private_key"),
                        "address": account.get("address"),
                        "seed": account.get("seed"),
                    }
                ).eq("account_id", account["account_id"]).execute()
            except Exception:
                pass

        return _sanitize_account_response(account)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/accounts/ngos", tags=["accounts"])
def get_all_ngo_accounts():
    """List NGO accounts with summary info."""
    try:
        res = (
            supabase.table(TBL_ACCOUNTS)
            .select("account_id,name,description,goal,status,lifetime_donations,created_at,public_key,address")
            .eq("account_type", "NGO")
            .execute()
        )
        items = res.data or []
        ngo_accounts: List[NGOAccountSummary] = []
        for item in items:
            # derive address if not stored
            xrpl_addr = item.get("address")
            if not xrpl_addr and item.get("public_key"):
                try:
                    xrpl_addr = derive_address_from_public_key(item["public_key"])
                except Exception:
                    xrpl_addr = None

            goal = item.get("goal", 0)
            if isinstance(goal, str):
                try:
                    goal = int(float(goal))
                except Exception:
                    goal = 0
            else:
                goal = int(goal or 0)

            ngo_accounts.append(
                NGOAccountSummary(
                    account_id=item["account_id"],
                    name=item.get("name", ""),
                    description=item.get("description", "") or "",
                    goal=goal,
                    status=item.get("status", "inactive"),
                    lifetime_donations=item.get("lifetime_donations", 0),
                    created_at=item.get("created_at"),
                    xrpl_address=xrpl_addr,
                )
            )
        return ngo_accounts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve NGO accounts: {e}") from e


@router.get("/accounts/dashboard/stats", tags=["accounts", "dashboard"])
def get_dashboard_stats(current_user: dict = Depends(verify_token)):
    """Return dashboard statistics for the current NGO account."""
    try:
        account = _get_account_by_id(current_user["sub"])
        if account.get("account_type") != "NGO":
            raise HTTPException(status_code=403, detail="Access denied: NGO account required")

        ngo_id = account["account_id"]

        # Active recipients count
        try:
            rec_res = (
                supabase.table(TBL_RECIPIENTS)
                .select("recipient_id,status,ngo_id")
                .eq("ngo_id", ngo_id)
                .execute()
            )
            rec_rows = rec_res.data or []
            active_recipients = sum(1 for r in rec_rows if r.get("status", "active") == "active")
        except Exception:
            active_recipients = 0

        # Expenses from external audit table
        try:
            exp_res = (
                supabase.table(TBL_NGO_EXPENSES)
                .select("expenses")
                .eq("ngo_id", ngo_id)
                .limit(1)
                .execute()
            )
            expenses = (exp_res.data or [{}])[0].get("expenses", 0.0) or 0.0
            total_expenses_cents = int(round(float(expenses) * 100))
        except Exception:
            total_expenses_cents = 0

        # Wallet available funds from XRP balance
        try:
            addr = account.get("address") or (
                derive_address_from_public_key(account["public_key"])
                if account.get("public_key")
                else None
            )
            usd = _wallet_usd(addr) if addr else Decimal("0.00")
            available_funds_cents = int((usd * Decimal(100)).to_integral_value(rounding=ROUND_DOWN))
        except Exception:
            available_funds_cents = 0

        # Lifetime donations as minor units
        lifetime = account.get("lifetime_donations", 0)
        if isinstance(lifetime, (int, float)) and lifetime < 10000:
            lifetime_cents = int(round(float(lifetime) * 100))
        else:
            lifetime_cents = int(lifetime or 0)

        # Goal in dollars (int)
        goal = account.get("goal", 0)
        if isinstance(goal, str):
            try:
                goal = int(float(goal))
            except Exception:
                goal = 0
        else:
            goal = int(goal or 0)

        utilization_rate = (total_expenses_cents / lifetime_cents * 100.0) if lifetime_cents > 0 else 0.0

        return {
            "active_recipients": active_recipients,
            "total_expenses": total_expenses_cents,
            "available_funds": available_funds_cents,
            "lifetime_donations": lifetime_cents,
            "goal": goal,
            "utilization_rate": utilization_rate,
            "last_updated": now_iso(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}") from e


@router.websocket("/ws/accounts/dashboard/balance")
async def stream_dashboard_balance(websocket: WebSocket, token: str = Query(default=None)):
    """Provide live updates for the NGO dashboard available funds via websocket."""

    if not token:
        await websocket.close(code=4401, reason="Authentication required")
        return

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        account_id = payload.get("sub")
        if not account_id:
            await websocket.close(code=4401, reason="Invalid token payload")
            return
    except jwt.ExpiredSignatureError:
        await websocket.close(code=4401, reason="Token expired")
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=4401, reason="Invalid token")
        return
    except Exception:
        await websocket.close(code=1011, reason="Authentication failed")
        return

    await websocket.accept()

    async def load_balance_snapshot() -> Tuple[int, str]:
        def _snapshot() -> Tuple[int, str]:
            account = _get_account_by_id(account_id)
            if account.get("account_type") != "NGO":
                raise PermissionError("NGO account required")

            addr = account.get("address") or (
                derive_address_from_public_key(account["public_key"])
                if account.get("public_key")
                else None
            )

            if not addr:
                return 0, now_iso()

            usd = _wallet_usd(addr)
            cents = int((usd * Decimal(100)).to_integral_value(rounding=ROUND_DOWN))
            return cents, now_iso()

        return await asyncio.to_thread(_snapshot)

    previous_balance: Optional[int] = None
    try:
        while True:
            try:
                available_cents, timestamp = await load_balance_snapshot()
            except PermissionError:
                await websocket.close(code=4403, reason="NGO account required")
                return
            except HTTPException as exc:
                code = 4404 if exc.status_code == 404 else 1011
                await websocket.close(code=code, reason=exc.detail)
                return
            except Exception:
                available_cents, timestamp = 0, now_iso()

            if previous_balance is None or available_cents != previous_balance:
                await websocket.send_json(
                    {"available_funds": available_cents, "last_updated": timestamp}
                )
                previous_balance = available_cents

            await asyncio.sleep(5)
    except WebSocketDisconnect:
        return
    except Exception:
        await websocket.close(code=1011, reason="Internal server error")


@router.get("/accounts/recipients", tags=["accounts", "recipients"])
def list_recipients(
    current_user: dict = Depends(verify_token),
    search: Optional[str] = None,
):
    """List recipients for the current NGO account."""
    try:
        account = _get_account_by_id(current_user["sub"])
        if account.get("account_type") != "NGO":
            raise HTTPException(status_code=403, detail="Access denied: NGO account required")

        ngo_id = account["account_id"]

        q = supabase.table(TBL_RECIPIENTS).select("*").eq("ngo_id", ngo_id)
        if search:
            like = f"%{search}%"
            # OR filter: name ilike OR location ilike
            # supabase python client does not support grouped OR directly; fetch and filter in Python.
            res = q.execute()
            rows = res.data or []
            rows = [
                r
                for r in rows
                if (r.get("name") and search.lower() in r["name"].lower())
                or (r.get("location") and search.lower() in r["location"].lower())
            ]
            for r in rows:
                balance = balance_from_public_key(r.get("public_key"))
                r["balance"] = balance.balance_usd if balance else 0.0
        else:
            res = q.execute()
            rows = res.data or []
            for r in rows:
                balance = balance_from_public_key(r.get("public_key"))
                r["balance"] = balance.balance_usd if balance else 0.0

        return {"recipients": rows, "count": len(rows)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}") from e


@router.post("/accounts/recipients", tags=["accounts", "recipients"])
def create_recipient(body: RecipientCreate, current_user: dict = Depends(verify_token)):
    """Create a new recipient and generate an XRPL wallet."""
    try:
        account = _get_account_by_id(current_user["sub"])
        if account.get("account_type") != "NGO":
            raise HTTPException(status_code=403, detail="Access denied: NGO account required")

        recipient_id = str(uuid.uuid4())
        ngo_id = account["account_id"]

        try:
            wallet = create_new_wallet()
            public_key = wallet["public_key"]
            private_key = wallet["private_key"]
            address = derive_address_from_public_key(public_key)
            seed = wallet["seed"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate XRPL wallet: {e}") from e

        data = {
            "recipient_id": recipient_id,
            "ngo_id": ngo_id,
            "name": body.name,
            "location": body.location,
            "public_key": public_key,
            "private_key": private_key,
            "address": address,
            "created_at": now_iso(),
            "seed": seed,
        }
        supabase.table(TBL_RECIPIENTS).insert(data).execute()

        return {"recipient_id": recipient_id, "status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}") from e


@router.post("/accounts/recipients/{recipient_id}/balance", tags=["accounts", "recipients"])
def manage_recipient_balance(
    recipient_id: str,
    body: BalanceOperation,
    current_user: dict = Depends(verify_token),
):
    """
    Manage balance for a recipient.
    - deposit: NGO -> Recipient on-chain transfer, then increment balance
    - withdraw: Recipient -> NGO on-chain transfer, then decrement balance
    Uses optimistic concurrency on the balance update.
    """
    try:
        operation = (body.operation_type or "").lower()
        if operation not in {"deposit", "withdraw"}:
            raise HTTPException(status_code=400, detail="operation_type must be 'deposit' or 'withdraw'")
        amount_usd = _usd(body.amount, positive=True)

        ngo = _get_account_by_id(current_user["sub"])
        if ngo.get("account_type") != "NGO":
            raise HTTPException(status_code=403, detail="Access denied: NGO account required")

        rec = _get_recipient_by_id(recipient_id)
        if rec.get("ngo_id") != ngo["account_id"]:
            raise HTTPException(status_code=404, detail="Recipient not found")

        balance_info = balance_from_public_key(rec.get("public_key"))
        current_balance = _usd(
            (balance_info.balance_usd if balance_info else 0.0),
            positive=False,
        )

        ngo_wallet = extract_wallet(
            ngo,
            error_detail="Wallet keys not properly configured",
            status_code=500,
        )
        recipient_wallet = extract_wallet(
            rec,
            error_detail="Wallet keys not properly configured",
            status_code=500,
        )

        if operation == "deposit":
            ensure_balance(
                ngo_wallet.address,
                float(amount_usd),
                entity="NGO",
                missing_detail="NGO wallet is not funded or could not fetch balance",
            )
            memo = body.description or f"Aid distribution to {rec.get('name','recipient')}"
            tx_hash = send_usd(
                ngo_wallet,
                destination=recipient_wallet.address,
                amount=float(amount_usd),
                memo=memo,
            )
            new_balance = (current_balance + amount_usd).quantize(Decimal("0.01"), rounding=ROUND_DOWN)

        else:  # withdraw
            if current_balance < amount_usd:
                raise HTTPException(status_code=400, detail="Insufficient balance")

            ensure_balance(
                recipient_wallet.address,
                float(amount_usd),
                entity="recipient",
                missing_detail="Recipient wallet is not funded or could not fetch balance",
            )
            memo = body.description or f"Withdrawal from {rec.get('name','recipient')}"
            tx_hash = send_usd(
                recipient_wallet,
                destination=ngo_wallet.address,
                amount=float(amount_usd),
                memo=memo,
            )
            new_balance = (current_balance - amount_usd).quantize(Decimal("0.01"), rounding=ROUND_DOWN)

        return {
            "previous_balance": float(current_balance),
            "new_balance": float(new_balance),
            "operation": operation,
            "amount": float(amount_usd),
            "tx_hash": tx_hash,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected server error: {e}") from e
