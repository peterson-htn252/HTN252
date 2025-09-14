FACE_AVAILABLE = False
_face_app = None


def get_face_app():
    """Lazy import to avoid crashing on incompatible wheels."""
    global _face_app, FACE_AVAILABLE
    if _face_app is not None:
        return _face_app
    try:
        from insightface.app import FaceAnalysis  # imported here
        _fa = FaceAnalysis(name="buffalo_l")
        _fa.prepare(ctx_id=-1, det_size=(640, 640))
        _face_app = _fa
        FACE_AVAILABLE = True
        return _face_app
    except Exception:
        FACE_AVAILABLE = False
        _face_app = None
        return None
