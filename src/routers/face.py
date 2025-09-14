from typing import List, Tuple, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
import numpy as np
import uuid, json

from core.face import get_face_app, FACE_AVAILABLE
from core.auth import get_current_ngo
from core.database import TBL_FACE_MAPS, TBL_PENDING_FACE_MAPS, TBL_ACCOUNTS
from core.utils import now_iso

router = APIRouter()

# -------------------- helpers --------------------

import random
import string

def generate_random_string(length):
    """
    Generates a random string of a specified length containing
    uppercase letters, lowercase letters, and digits.
    """
    characters = string.ascii_letters + string.digits
    random_string = ''.join(random.choice(characters) for i in range(length))
    return random_string

# Example usage:

def _img_bytes_to_ndarray(data: bytes):
    import cv2
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)  # BGR
    if img is None:
        raise HTTPException(400, "Invalid image file")
    return img

def _first_face_normed_embedding(img) -> Tuple[np.ndarray, dict]:
    """
    Find the largest face and return an L2-normalized embedding.
    Tries a few light fallbacks (RGB/CLAHE/scale/rotation) and lowers det_thresh a bit.
    """
    import cv2
    appf = get_face_app()
    # if appf is None or not FACE_AVAILABLE:
    #     raise HTTPException(503, "InsightFace not available on server")

    img0 = np.ascontiguousarray(img)

    old_det_thresh = getattr(appf, "det_thresh", 0.5)
    try:
        appf.det_thresh = min(0.32, old_det_thresh)
    except Exception:
        pass
    try:
        if not hasattr(appf, "det_size") or appf.det_size[0] < 640:
            appf.det_size = (640, 640)
    except Exception:
        pass

    def try_get(x):
        faces = appf.get(x, max_num=5)
        return faces if faces else []

    tries = [img0]
    # RGB
    try:
        import cv2
        tries.append(cv2.cvtColor(img0, cv2.COLOR_BGR2RGB))
    except Exception:
        pass
    # CLAHE on Y
    try:
        yuv = cv2.cvtColor(img0, cv2.COLOR_BGR2YUV)
        yuv[:, :, 0] = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(yuv[:, :, 0])
        tries.append(cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR))
    except Exception:
        pass
    # mild scales
    h, w = img0.shape[:2]
    for s in (1.35, 0.85):
        try:
            tries.append(cv2.resize(img0, (int(w * s), int(h * s)), interpolation=cv2.INTER_LINEAR))
        except Exception:
            pass
    # 90° rotations
    for rot in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE):
        try:
            tries.append(cv2.rotate(img0, rot))
        except Exception:
            pass

    faces = []
    for cand in tries:
        faces = try_get(cand)
        if faces:
            break

    # restore detector threshold
    try:
        appf.det_thresh = old_det_thresh
    except Exception:
        pass

    if not faces:
        raise HTTPException(400, "No face detected")

    # largest face
    faces.sort(key=lambda f: max(0, int(f.bbox[2]-f.bbox[0])) * max(0, int(f.bbox[3]-f.bbox[1])), reverse=True)
    f0 = faces[0]

    emb = getattr(f0, "normed_embedding", None)
    if emb is None:
        vec = f0.embedding.astype(np.float32)
        n = np.linalg.norm(vec) + 1e-12
        emb = (vec / n).astype(np.float32)
    else:
        emb = emb.astype(np.float32)

    meta = {"bbox": [float(x) for x in f0.bbox.tolist()], "det_score": float(getattr(f0, "det_score", 0))}
    return emb, meta

def _mean_centroid(embs: List[np.ndarray]) -> np.ndarray:
    """Average the (already L2-normalized) embeddings, then L2 re-normalize."""
    E = np.stack(embs).astype(np.float32)
    c = E.mean(axis=0)
    c /= (np.linalg.norm(c) + 1e-12)
    return c

def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))

# -------------------- API: ENROLL (PENDING) --------------------

@router.post("/face/enroll", tags=["face"])
async def face_enroll(
    files: List[UploadFile] = File(...),
    session_id: Optional[str] = Form(None),
):
    """
    Step 1 (pending): accept a short burst of images + optional session_id.
    Build a mean embedding centroid and store in TBL_PENDING_FACE_MAPS keyed by the session.
    Later, /face/promote will link it to an account and move it to TBL_FACE_MAPS.
    """
    # if not FACE_AVAILABLE or get_face_app() is None:
    #     raise HTTPException(503, "InsightFace not available on server")

    if session_id is None:
        session_id = str(uuid.uuid4())

    embs: List[np.ndarray] = []
    used = 0

    for uf in files:
        data = await uf.read()
        if not data:
            continue
        img = _img_bytes_to_ndarray(data)
        emb, _ = _first_face_normed_embedding(img)
        embs.append(emb)
        used += 1

    if not embs:
        raise HTTPException(400, "No faces detected in batch")

    centroid = _mean_centroid(embs)

    row = {
        "face_id": str(uuid.uuid4()),
        "session_id": session_id,
        "embedding": json.dumps([float(x) for x in centroid.tolist()]),
        "model": "buffalo_l",
        "meta": json.dumps({"frames_used": used, "source": "enroll_pending_mean"}),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    TBL_PENDING_FACE_MAPS.put_item(Item=row)

    return {
        "face_id": row["face_id"],
        "session_id": session_id,
        "frames_used": used,
    }

# -------------------- API: PROMOTE --------------------

@router.post("/face/promote", tags=["face"])
async def face_promote(
    session_id: str = Form(...),
    name: str = Form(...),
):
    """
    Step 2 (promote): link the pending embedding (by session_id) to a user account (by name),
    then move it into TBL_FACE_MAPS and delete the pending row.
    """
    # grab pending by session_id
    pend = TBL_PENDING_FACE_MAPS.scan(
        FilterExpression="#sid = :sid",
        ExpressionAttributeNames={"#sid": "session_id"},
        ExpressionAttributeValues={":sid": session_id},
    )
    items = pend.get("Items", []) or []
    if not items:
        raise HTTPException(404, "Pending face map not found for this session")

    row = items[0]

    # look up account by name (disambiguate if needed)
    acct = TBL_ACCOUNTS.scan(
        FilterExpression="#nm = :nm",
        ExpressionAttributeNames={"#nm": "name"},
        ExpressionAttributeValues={":nm": name},
    )
    accounts = acct.get("Items", []) or []
    if not accounts:
        raise HTTPException(404, "Account not found for this name")
    if len(accounts) > 1:
        raise HTTPException(409, "Multiple accounts share this name. Please disambiguate.")

    account = accounts[0]
    row["account_id"] = account["account_id"]
    row["ngo_id"] = account.get("ngo_id")
    row["updated_at"] = now_iso()

    # move to FACE_MAPS and delete from PENDING
    TBL_FACE_MAPS.put_item(Item=row)
    TBL_PENDING_FACE_MAPS.delete_item({"face_id": row["face_id"]})

    return {
        "face_id": row["face_id"],
        "account_id": row["account_id"],
        "ngo_id": row.get("ngo_id"),
    }

# -------------------- API: IDENTIFY (BURST -> MEAN) --------------------

@router.post("/face/identify_batch", tags=["face"])
async def face_identify_batch(
    files: List[UploadFile] = File(...),
    top_k: int = 3,
    threshold: float = 0.40,
    current_ngo: dict = Depends(get_current_ngo),
):
    """
    Identify an unknown user from a short burst:
    - average embeddings across burst to one centroid
    - cosine-match against stored embeddings for the current NGO
    """
    # if not FACE_AVAILABLE or get_face_app() is None:
    #     raise HTTPException(503, "InsightFace not available on server")

    unk_embs: List[np.ndarray] = []
    frames_used = 0

    for uf in files:
        data = await uf.read()
        if not data:
            continue
        try:
            img = _img_bytes_to_ndarray(data)
            emb, _ = _first_face_normed_embedding(img)
            unk_embs.append(emb)
            frames_used += 1
        except HTTPException:
            continue

    if not unk_embs:
        raise HTTPException(400, "No faces detected in batch")

    unk = _mean_centroid(unk_embs)

    # match within NGO
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
            if e.size != unk.size:
                mismatched += 1
                continue
            score = _cosine(unk, e)
            scored.append({
                "account_id": it.get("account_id"),
                "face_id": it.get("face_id"),
                "score": float(score),
            })
        except Exception:
            continue

    scored.sort(key=lambda r: r["score"], reverse=True)
    top = scored[: max(1, top_k)]
    if not top or top[0]["score"] < threshold:
        return {
            "frames_used": int(frames_used),
            "matches": [],
            "model": "buffalo_l",
            "debug": {"mismatched_dims": int(mismatched)},
        }

    return {
        "frames_used": int(frames_used),
        "matches": top,
        "model": "buffalo_l",
        "debug": {"mismatched_dims": int(mismatched)},
    }
