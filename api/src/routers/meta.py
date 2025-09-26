from fastapi import APIRouter

from core.face import face_available
from core.config import XRPL_NETWORK

router = APIRouter()


@router.get("/healthz", tags=["meta"])
def healthz():
    return {"ok": True, "face": face_available(), "network": XRPL_NETWORK}
