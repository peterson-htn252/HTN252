"""
FastAPI APIs for NGO voucher system on XRPL (wallet-less stores) + Facial Recognition (InsightFace)
- Stores do NOT have wallets; they get fiat payouts via an off-ramp partner
- NGO has XRPL hot wallet (dev/test); recipients hold off-ledger balances (with optional XRPL link)
- Includes: NGO auth, recipients CRUD & balances, quotes, redeem, payouts, store payout methods,
  credentials (VC-JWT HMAC for dev), dashboard metrics, and facial embeddings enroll/identify

Notes:
- Supabase Postgres is used (publishable key expected in backend). Create tables from the schema I provided earlier.
- XRPL and signing are simplified for a hackathon; swap in real KMS/HSM for prod.
- InsightFace runs in CPU mode by default here.

Run:
  pip install fastapi uvicorn supabase insightface onnxruntime opencv-python-headless numpy passlib[bcrypt] pyjwt xrpl-py
  export SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... JWT_SECRET=... APP_SECRET=...
  PORT=8000 uvicorn app:app --reload

Set the PORT/HOST environment variables to override the defaults when running locally.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (
    accounts,
    recipients,
    face,
    financial,
    credentials,
    auth as auth_router,
    dashboard,
    meta,
    llm,
    donor,
)

docs_url = "/docs"
redoc_url = "/redoc"

if os.getenv("APP_ENV") == "prod":
    docs_url=None
    redoc_url=None

app = FastAPI(title="XRPL Voucher APIs (Supabase + Face)", version="1.0.0", docs_url=docs_url, redoc_url=redoc_url)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

app.include_router(face.router)
app.include_router(accounts.router)
app.include_router(recipients.router)
app.include_router(financial.router)
app.include_router(credentials.router)
app.include_router(auth_router.router)
app.include_router(dashboard.router)
app.include_router(meta.router)
app.include_router(llm.router)
app.include_router(donor.router)

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, reload=True)
