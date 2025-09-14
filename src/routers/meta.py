from fastapi import APIRouter

from core.xrpl import XRPL_AVAILABLE
from core.face import FACE_AVAILABLE
from core.config import XRPL_NETWORK

router = APIRouter()


@router.get("/healthz", tags=["meta"])
def healthz():
    return {"ok": True, "xrpl": XRPL_AVAILABLE, "face": FACE_AVAILABLE, "network": XRPL_NETWORK}
