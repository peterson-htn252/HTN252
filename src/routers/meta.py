from fastapi import APIRouter

from core.face import FACE_AVAILABLE
from core.config import XRPL_NETWORK

router = APIRouter()


@router.get("/healthz", tags=["meta"])
def healthz():
    return {"ok": True, "face": FACE_AVAILABLE, "network": XRPL_NETWORK}
