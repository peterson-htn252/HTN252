from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.auth import get_current_ngo
from core.database import TBL_RECIPIENTS, TBL_DONATIONS, TBL_EXPENSES
from core.utils import now_iso

router = APIRouter()


@router.get("/ngo/dashboard/stats", tags=["ngo"])
def get_dashboard_stats(current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        recipients_resp = TBL_RECIPIENTS.scan(
            FilterExpression="ngo_id = :ngo_id AND #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":ngo_id": ngo_id, ":status": "active"},
        )
        active_recipients = len(recipients_resp.get("Items", []))
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        donations_resp = TBL_DONATIONS.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": thirty_days_ago},
        )
        total_donations = sum(item.get("amount_minor", 0) for item in donations_resp.get("Items", []))
        expenses_resp = TBL_EXPENSES.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": thirty_days_ago},
        )
        total_expenses = sum(item.get("amount_minor", 0) for item in expenses_resp.get("Items", []))
        available_funds = total_donations - total_expenses
        return {
            "active_recipients": active_recipients,
            "total_donations_30d": total_donations,
            "total_expenses_30d": total_expenses,
            "available_funds": available_funds,
            "utilization_rate": (total_expenses / total_donations * 100) if total_donations > 0 else 0,
            "last_updated": now_iso(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/ngo/dashboard/expense-breakdown", tags=["ngo"])
def get_expense_breakdown(current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        expenses_resp = TBL_EXPENSES.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": thirty_days_ago},
        )
        category_totals = {}
        for expense in expenses_resp.get("Items", []):
            category = expense.get("category", "Other")
            amount = expense.get("amount_minor", 0)
            category_totals[category] = category_totals.get(category, 0) + amount
        expense_data = [
            {"name": category, "value": amount}
            for category, amount in category_totals.items()
        ]
        return {"expense_breakdown": expense_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/ngo/dashboard/monthly-trends", tags=["ngo"])
def get_monthly_trends(current_ngo: dict = Depends(get_current_ngo)):
    ngo_id = current_ngo["ngo_id"]
    try:
        six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
        donations_resp = TBL_DONATIONS.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": six_months_ago.isoformat()},
        )
        expenses_resp = TBL_EXPENSES.scan(
            FilterExpression="ngo_id = :ngo_id AND created_at > :date",
            ExpressionAttributeValues={":ngo_id": ngo_id, ":date": six_months_ago.isoformat()},
        )
        monthly_data = {}
        for i in range(6):
            month_date = datetime.now(timezone.utc) - timedelta(days=30 * i)
            month_key = month_date.strftime("%b")
            monthly_data[month_key] = {"donations": 0, "expenses": 0}
        for donation in donations_resp.get("Items", []):
            created_at = datetime.fromisoformat(donation["created_at"].replace("Z", "+00:00"))
            month_key = created_at.strftime("%b")
            if month_key in monthly_data:
                monthly_data[month_key]["donations"] += donation.get("amount_minor", 0)
        for expense in expenses_resp.get("Items", []):
            created_at = datetime.fromisoformat(expense["created_at"].replace("Z", "+00:00"))
            month_key = created_at.strftime("%b")
            if month_key in monthly_data:
                monthly_data[month_key]["expenses"] += expense.get("amount_minor", 0)
        trends = [
            {"month": month, **data}
            for month, data in monthly_data.items()
        ]
        return {"monthly_trends": trends}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
