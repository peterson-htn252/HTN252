# --- new code ---
from typing import List, Optional
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
    # if appf is None:
    #     raise HTTPException(503, "InsightFace not available on server")
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
async def face_enroll_batch(
    files: List[UploadFile] = File(...),
    account_id: Optional[str] = Form(None),
):
    # if not FACE_AVAILABLE:
    #     return {"note": "InsightFace not installed on server"}

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

    if not embs: # TODO: NEed to fix getting embeddings
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

    account_id = account_id or str(uuid.uuid4())
    current_ngo = {"ngo_id": "demo-ngo"}  # TODO: query from account id
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

@router.post("/face/identify_batch", tags=["face"])
async def face_identify_batch(
    files: List[UploadFile] = File(...),
    top_k: int = 3,
    threshold: float = 0.40,
    trim_quantile: float = 0.3,     # drop worst 30% frames if >=5 frames
    current_ngo: dict = Depends(get_current_ngo),
):
    """
    Identify using a short burst of frames.
    Strategy: per-frame embedding -> weighted centroid -> L2 normalize -> optional outlier trim -> match.
    Returns: {"frames_used", "matches": [{account_id, face_id, score}], "model", "debug": {...}}
    """
    # if not FACE_AVAILABLE:
    #     return {"note": "InsightFace not installed on server"}

    import cv2

    embs = []
    weights = []
    frames_used = 0

    for uf in files:
        try:
            data = await uf.read()
            img = _img_bytes_to_ndarray(data)
            emb, meta = _best_face_embedding(img)

            # --- simple quality weighting ---
            x1, y1, x2, y2 = [int(v) for v in meta["bbox"]]
            H, W = img.shape[:2]
            area = (max(0, x2 - x1) * max(0, y2 - y1)) / (H * W + 1e-6)
            if x2 > x1 and y2 > y1:
                gray = cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
                blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            else:
                blur = 0.0
            det = float(meta.get("det_score", 0.0))

            # weights in [0, 1] roughly
            w = 0.6 * det + 0.2 * min(1.0, area * 3.0) + 0.2 * min(1.0, blur / 200.0)
            w = max(w, 1e-6)

            embs.append(emb)
            weights.append(w)
            frames_used += 1
        except HTTPException:
            continue
        except Exception:
            continue

    if not embs:
        raise HTTPException(400, "No faces detected in batch")

    E = np.stack(embs).astype(np.float32)         # N x D (rows already L2-normalized)
    w = np.asarray(weights, dtype=np.float32)
    w = w / (w.sum() + 1e-12)

    # Initial centroid
    c = (w[:, None] * E).sum(axis=0)
    c = c / (np.linalg.norm(c) + 1e-12)

    # Outlier trim (optional)
    sims = (E @ c)                                 # cosine to centroid per frame
    keep_mask = np.ones(len(E), dtype=bool)
    if len(E) >= 5 and 0.0 <= trim_quantile < 0.5:
        cut = float(np.quantile(sims, trim_quantile))
        keep_mask = sims >= cut
        if keep_mask.sum() >= 3:
            E2 = E[keep_mask]
            w2 = w[keep_mask]
            w2 = w2 / (w2.sum() + 1e-12)
            c = (w2[:, None] * E2).sum(axis=0)
            c = c / (np.linalg.norm(c) + 1e-12)

    # --- match against stored embeddings for this NGO ---
    resp = TBL_FACE_MAPS.scan(
        FilterExpression="ngo_id = :ngo",
        ExpressionAttributeValues={":ngo": current_ngo["ngo_id"]},
    )
    items = resp.get("Items", []) or []

    scored = []
    mismatched = 0
    for it in items:
        try:
            e = np.asarray(json.loads(it.get("embedding", "[]")), dtype=np.float32)
            if e.size != c.size:
                mismatched += 1
                continue
            score = _cosine(c, e)
            scored.append({
                "account_id": it.get("account_id"),
                "face_id": it.get("face_id"),
                "score": float(score),
            })
        except Exception:
            continue

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[: max(1, top_k)]
    if not top or top[0]["score"] < threshold:
        return {
            "frames_used": int(frames_used),
            "matches": [],
            "model": "buffalo_l",
            "debug": {"mismatched_dims": int(mismatched)}
        }

    return {
        "frames_used": int(frames_used),
        "matches": top,
        "model": "buffalo_l",
        "debug": {
            "trimmed": int((~keep_mask).sum()),
            "mismatched_dims": int(mismatched),
            "centroid_confidence": float(sims.mean()) if sims.size else 0.0,
        },
    }
