# --- new code ---
from typing import List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
import numpy as np
import uuid, json

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

def _best_face_embedding(img):
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

@router.post("/face/enroll_batch", tags=["face"])
async def face_enroll_batch(
    account_id: str = Form(...),
    files: List[UploadFile] = File(...),
    current_ngo: dict = Depends(get_current_ngo),
):
    if not FACE_AVAILABLE:
        return {"note": "InsightFace not installed on server"}

    import cv2

    embs = []
    weights = []
    used = 0

    for uf in files:
        try:
            data = await uf.read()
            img = _img_bytes_to_ndarray(data)
            emb, meta = _best_face_embedding(img)

            # simple quality scoring for weighting
            x1, y1, x2, y2 = [int(v) for v in meta["bbox"]]
            area = (max(0, x2 - x1) * max(0, y2 - y1)) / (img.shape[0] * img.shape[1] + 1e-6)
            face_roi = img[max(0, y1):max(0, y2), max(0, x1):max(0, x2)]
            if face_roi.size:
                gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
                blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            else:
                blur = 0.0

            # weight combines detector confidence, face size, sharpness
            w = 0.6 * float(meta.get("det_score", 0.0)) + 0.2 * min(1.0, area * 3.0) + 0.2 * min(1.0, blur / 200.0)
            w = max(w, 1e-6)

            embs.append(emb)
            weights.append(w)
            used += 1
        except HTTPException:
            continue
        except Exception:
            continue

    if not embs:
        raise HTTPException(400, "No faces detected in batch")

    E = np.stack(embs).astype(np.float32)         # N x D, already L2-normalized rows
    w = np.asarray(weights, dtype=np.float32)
    w = w / (w.sum() + 1e-12)

    # preliminary centroid
    c = (w[:, None] * E).sum(axis=0)
    c = c / (np.linalg.norm(c) + 1e-12)

    # trim outliers: drop bottom 20% by cosine to centroid
    sims = (E @ c)
    if sims.size >= 5:
        thresh = float(np.quantile(sims, 0.2))
        keep = sims >= thresh
        if keep.sum() >= 3:
            E2 = E[keep]
            w2 = w[keep]
            w2 = w2 / (w2.sum() + 1e-12)
            c = (w2[:, None] * E2).sum(axis=0)
            c = c / (np.linalg.norm(c) + 1e-12)

    row = {
        "face_id": str(uuid.uuid4()),
        "account_id": account_id,
        "ngo_id": current_ngo["ngo_id"],
        "embedding": json.dumps([float(x) for x in c.tolist()]),
        "model": "buffalo_l",
        "meta": json.dumps({"frames_used": used}),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    TBL_FACE_MAPS.put_item(Item=row)
    return {"face_id": row["face_id"], "account_id": account_id, "frames_used": used}
