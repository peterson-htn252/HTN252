import json
import uuid
from typing import Tuple

import numpy as np
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException

from core.face import get_face_app, FACE_AVAILABLE
from core.auth import get_current_ngo
from core.database import TBL_FACE_MAPS
from core.utils import now_iso

router = APIRouter()


def _img_bytes_to_ndarray(data: bytes):
    import cv2
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Invalid image file")
    return img


def _best_face_embedding(img) -> Tuple[np.ndarray, dict]:
    appf = get_face_app()
    if appf is None:
        raise HTTPException(503, "InsightFace not available on server")
    faces = appf.get(img)
    if not faces:
        raise HTTPException(400, "No face detected")

    def area(f):
        x1, y1, x2, y2 = f.bbox.astype(int)
        return max(0, x2 - x1) * max(0, y2 - y1)

    faces.sort(key=area, reverse=True)
    f0 = faces[0]
    emb = getattr(f0, "normed_embedding", None)
    if emb is None:
        vec = f0.embedding.astype(np.float32)
        n = np.linalg.norm(vec) + 1e-12
        emb = (vec / n).astype(np.float32)
    meta = {"bbox": f0.bbox.tolist(), "det_score": float(getattr(f0, "det_score", 0))}
    return emb, meta


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


@router.post("/face/enroll", tags=["face"])
async def face_enroll(
    account_id: str = Form(...),
    file: UploadFile = File(...),
    current_ngo: dict = Depends(get_current_ngo),
):
    if not FACE_AVAILABLE:
        return {"note": "InsightFace not installed on server"}
    data = await file.read()
    img = _img_bytes_to_ndarray(data)
    emb, meta = _best_face_embedding(img)

    row = {
        "face_id": str(uuid.uuid4()),
        "account_id": account_id,
        "ngo_id": current_ngo["ngo_id"],
        "embedding": json.dumps([float(x) for x in emb.tolist()]),
        "model": "buffalo_l",
        "meta": json.dumps(meta),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    TBL_FACE_MAPS.put_item(Item=row)
    return {"face_id": row["face_id"], "account_id": account_id}


@router.post("/face/identify", tags=["face"])
async def face_identify(
    file: UploadFile = File(...),
    top_k: int = 3,
    threshold: float = 0.40,
    current_ngo: dict = Depends(get_current_ngo),
):
    if not FACE_AVAILABLE:
        return {"note": "InsightFace not installed on server"}
    data = await file.read()
    img = _img_bytes_to_ndarray(data)
    emb_query, _ = _best_face_embedding(img)

    resp = TBL_FACE_MAPS.scan(
        FilterExpression="ngo_id = :ngo",
        ExpressionAttributeValues={":ngo": current_ngo["ngo_id"]},
    )
    items = resp.get("Items", []) or []

    scored = []
    for it in items:
        try:
            e = np.asarray(json.loads(it.get("embedding", "[]")), dtype=np.float32)
            if e.size != emb_query.size:
                continue
            score = _cosine(emb_query, e)
            scored.append({"account_id": it.get("account_id"), "face_id": it.get("face_id"), "score": score})
        except Exception:
            continue

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[: max(1, top_k)]
    if not top or top[0]["score"] < threshold:
        return {"matches": []}
    return {"matches": top}
