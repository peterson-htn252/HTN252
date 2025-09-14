"""
FastAPI APIs for NGO voucher system on XRPL (wallet-less stores) + Facial Recognition (InsightFace)
- Stores do NOT have wallets; they get fiat payouts via an off-ramp partner
- NGO has XRPL hot wallet (dev/test); recipients hold off-ledger balances (with optional XRPL link)
- Includes: NGO auth, recipients CRUD & balances, quotes, redeem, payouts, store payout methods,
  credentials (VC-JWT HMAC for dev), dashboard metrics, and facial embeddings enroll/identify

Notes:
- Supabase Postgres is used (service role in backend). Create tables from the schema I provided earlier.
- XRPL and signing are simplified for a hackathon; swap in real KMS/HSM for prod.
- InsightFace runs in CPU mode by default here.

Run:
  pip install fastapi uvicorn supabase insightface onnxruntime opencv-python-headless numpy passlib[bcrypt] pyjwt xrpl-py
  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... JWT_SECRET=... APP_SECRET=...
  uvicorn app:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import accounts, recipients, face, financial, credentials, auth as auth_router, dashboard, meta

app = FastAPI(title="XRPL Voucher APIs (Supabase + Face)", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(face.router)
app.include_router(accounts.router)
app.include_router(recipients.router)
app.include_router(financial.router)
app.include_router(credentials.router)
app.include_router(auth_router.router)
app.include_router(dashboard.router)
app.include_router(meta.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
