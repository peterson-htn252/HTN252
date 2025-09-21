import os
from typing import Optional, Dict

from supabase import create_client, Client
from .config import SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY


supabase: Client = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)


class SupabaseTable:
    def __init__(self, client: Client, name: str):
        self.client = client
        self.name = name

    def get_item(self, Key: dict):
        q = self.client.table(self.name).select("*")
        for k, v in Key.items():
            q = q.eq(k, v)
        resp = q.single().execute()
        return {"Item": resp.data}

    def put_item(self, Item: dict):
        self.client.table(self.name).insert(Item).execute()

    def update_item(
        self,
        Key: dict,
        UpdateExpression: str = "",
        ExpressionAttributeValues: Optional[Dict[str, object]] = None,
        ExpressionAttributeNames: Optional[Dict[str, str]] = None,
    ):
        updates: Dict[str, object] = {}
        if UpdateExpression and ExpressionAttributeValues:
            expr = UpdateExpression.replace("SET", "").strip()
            parts = [p.strip() for p in expr.split(",")]
            for part in parts:
                if "=" in part:
                    field, value_key = [s.strip() for s in part.split("=")]
                    if field.startswith("#") and ExpressionAttributeNames:
                        field = ExpressionAttributeNames.get(field, field)
                    updates[field] = ExpressionAttributeValues.get(value_key)
        elif ExpressionAttributeValues:
            for k, v in ExpressionAttributeValues.items():
                updates[k.lstrip(":")] = v
        q = self.client.table(self.name).update(updates)
        for k, v in Key.items():
            q = q.eq(k, v)
        q.execute()

    def scan(
        self,
        FilterExpression: Optional[str] = None,
        ExpressionAttributeValues: Optional[Dict[str, object]] = None,
        ExpressionAttributeNames: Optional[Dict[str, str]] = None,
        ProjectionExpression: Optional[str] = None,
    ):
        sel = "*" if not ProjectionExpression else ProjectionExpression
        q = self.client.table(self.name).select(sel)
        if FilterExpression and ExpressionAttributeValues:
            for cond in [c.strip() for c in FilterExpression.split("AND")]:
                if "=" in cond:
                    attr, placeholder = [x.strip() for x in cond.split("=")]
                    if attr.startswith("#") and ExpressionAttributeNames:
                        attr = ExpressionAttributeNames.get(attr, attr)
                    val = ExpressionAttributeValues.get(placeholder)
                    q = q.eq(attr, val)
        resp = q.execute()
        return {"Items": resp.data}

    def delete_item(self, Key: dict):
        q = self.client.table(self.name).delete()
        for k, v in Key.items():
            q = q.eq(k, v)
        q.execute()


TBL_ACCOUNTS = SupabaseTable(supabase, os.getenv("ACCOUNTS_TABLE", "accounts"))
TBL_WALLETS = SupabaseTable(supabase, os.getenv("XRPL_WALLETS_TABLE", "xrpl_wallets"))
TBL_STORE_METHODS = SupabaseTable(supabase, os.getenv("STORE_PAYOUT_METHODS_TABLE", "store_payout_methods"))
TBL_PAYOUTS = SupabaseTable(supabase, os.getenv("PAYOUTS_TABLE", "payouts"))
TBL_MOVES = SupabaseTable(supabase, os.getenv("XRPL_MOVEMENTS_TABLE", "xrpl_movements"))
TBL_ISSUERS = SupabaseTable(supabase, os.getenv("ISSUERS_TABLE", "issuers"))
TBL_CREDS = SupabaseTable(supabase, os.getenv("CREDS_TABLE", "credentials"))
TBL_REVOKE = SupabaseTable(supabase, os.getenv("REVOKE_TABLE", "revocations"))
TBL_NGOS = SupabaseTable(supabase, os.getenv("NGOS_TABLE", "ngos"))
TBL_PROGRAMS = SupabaseTable(supabase, os.getenv("PROGRAMS_TABLE", "programs"))
TBL_DONATIONS = SupabaseTable(supabase, os.getenv("DONATIONS_TABLE", "donations"))
TBL_EXPENSES = SupabaseTable(supabase, os.getenv("EXPENSES_TABLE", "expenses"))
TBL_RECIPIENTS = SupabaseTable(supabase, os.getenv("RECIPIENTS_TABLE", "recipients"))
TBL_NGO_EXPENSES = SupabaseTable(supabase, os.getenv("NGO_EXPENSES_TABLE", "ngo_expense"))
TBL_FACE_MAPS = SupabaseTable(supabase, os.getenv("FACE_MAPS_TABLE", "face_maps"))
TBL_PENDING_FACE_MAPS = SupabaseTable(
    supabase, os.getenv("PENDING_FACE_MAPS_TABLE", "pending_face_maps")
)
