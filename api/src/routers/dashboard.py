from fastapi import APIRouter, Depends, HTTPException

from core.auth import get_current_ngo
from core.database import TBL_ACCOUNTS, TBL_NGO_EXPENSES, TBL_RECIPIENTS
from core.utils import now_iso
from core.wallet import get_wallet_balance, resolve_classic_address

router = APIRouter()


@router.get("/ngo/dashboard/stats", tags=["ngo"])
def get_dashboard_stats(current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        # Get active recipients count
        recipients_resp = TBL_RECIPIENTS.scan(
            FilterExpression="ngo_id = :ngo_id AND #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":ngo_id": ngo_id, ":status": "active"},
        )
        active_recipients = len(recipients_resp.get("Items", []))

        # Get NGO account details
        account = TBL_ACCOUNTS.get_item(Key={"account_id": ngo_id}).get("Item")
        if not account:
            raise HTTPException(status_code=404, detail="NGO account not found")

        # Get available funds from wallet balance (primary source of truth)
        available_funds = 0
        try:
            addr = account.get("address") or resolve_classic_address(account)
            balance = get_wallet_balance(addr) if addr else None
            if balance:
                available_funds = int(round(balance.balance_usd * 100))
        except Exception:
            available_funds = 0

        # Get total NGO expenses from auditor table
        try:
            ngo_expense_resp = TBL_NGO_EXPENSES.get_item(Key={"ngo_id": ngo_id})
            total_expenses = int((ngo_expense_resp.get("Item", {}).get("expenses", 0.0)) * 100)  # Convert to minor units
        except Exception:
            total_expenses = 0

        # Get lifetime donations and goal from account
        lifetime_donations = account.get("lifetime_donations", 0)
        # Convert to minor units if needed
        if isinstance(lifetime_donations, (int, float)) and lifetime_donations < 10000:
            lifetime_donations = int(lifetime_donations * 100)
        else:
            lifetime_donations = int(lifetime_donations)

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

        # Calculate utilization rate
        utilization_rate = (total_expenses / lifetime_donations * 100) if lifetime_donations > 0 else 0

        return {
            "active_recipients": active_recipients,
            "total_expenses": total_expenses,  # From auditor table
            "available_funds": available_funds,  # From wallet balance
            "lifetime_donations": lifetime_donations,  # Total raised ever
            "goal": goal,  # Target amount
            "utilization_rate": utilization_rate,
            "last_updated": now_iso(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}") from e
