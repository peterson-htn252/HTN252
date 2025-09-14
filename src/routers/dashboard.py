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


