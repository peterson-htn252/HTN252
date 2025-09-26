# core/face.py
import os, traceback
from threading import Lock

from insightface.app import FaceAnalysis
import onnxruntime as ort

class _FaceAppSingleton:
    FACE_AVAILABLE = False
    face_app = None
    face_lock = Lock()

def face_available():
    """Check if face recognition is available (InsightFace initialized)."""
    return _FaceAppSingleton.FACE_AVAILABLE

def get_face_app():
    """Lazy, robust InsightFace singleton with provider/model fallbacks."""
    if _FaceAppSingleton.face_app is not None:
        return _FaceAppSingleton.face_app

    with _FaceAppSingleton.face_lock:
        if _FaceAppSingleton.face_app is not None:
            return _FaceAppSingleton.face_app
        try:
            # Providers (env override → ORT detect → CPU)
            providers_env = os.getenv("INSIGHTFACE_PROVIDERS", "").strip()
            if providers_env:
                providers = [p.strip() for p in providers_env.split(",") if p.strip()]
            else:
                try:
                    avail = list(ort.get_available_providers() or [])
                except Exception:
                    avail = []
                pref = ["CUDAExecutionProvider", "CoreMLExecutionProvider", "ROCmExecutionProvider", "CPUExecutionProvider"]
                providers = [p for p in pref if p in avail] or ["CPUExecutionProvider"]

            # Tunables
            model_candidates = [os.getenv("INSIGHTFACE_MODEL", "buffalo_l"), "antelopev2", "buffalo_sc"]
            root = os.getenv("INSIGHTFACE_ROOT", os.path.expanduser("~/.insightface"))
            det_w = int(os.getenv("INSIGHTFACE_DET_W", "640"))
            det_h = int(os.getenv("INSIGHTFACE_DET_H", "640"))
            ctx_id = int(os.getenv("INSIGHTFACE_CTX", "0" if providers[0].startswith("CUDA") else "-1"))

            last_err = None
            for name in model_candidates:
                # Try several constructor signatures (version differences)
                ctor_attempts = [
                    dict(name=name, root=root, providers=providers, allowed_modules=["detection", "recognition"], download=True),
                    dict(name=name, root=root, providers=providers, allowed_modules=["detection", "recognition"]),
                    dict(name=name, root=root, providers=providers),
                    dict(name=name, root=root),
                    dict(name=name),
                ]
                for kw in ctor_attempts:
                    try:
                        fa = FaceAnalysis(**kw)
                        # Some versions assert() inside __init__ if models missing; catch early
                        if not getattr(fa, "models", None) or "detection" not in getattr(fa, "models", {}):
                            # Try prepare anyway; some versions populate at prepare
                            fa.prepare(ctx_id=ctx_id, det_size=(det_w, det_h))
                        else:
                            fa.prepare(ctx_id=ctx_id, det_size=(det_w, det_h))
                        if getattr(fa, "models", None) and "detection" in fa.models:
                            _FaceAppSingleton.face_app = fa
                            _FaceAppSingleton.FACE_AVAILABLE = True
                            return _FaceAppSingleton.face_app
                    except TypeError as e:
                        last_err = e
                        continue
                    except AssertionError as e:
                        last_err = e
                        continue
                    except Exception as e:
                        last_err = e
                        continue

            # All attempts failed
            _FaceAppSingleton.FACE_AVAILABLE = False
            _FaceAppSingleton.face_app = None
            print("[core.face] InsightFace init failed after fallbacks:", repr(last_err))
            return None

        except Exception:
            _FaceAppSingleton.FACE_AVAILABLE = False
            _FaceAppSingleton.face_app = None
            print("[core.face] InsightFace init fatal:\n" + traceback.format_exc())
            return None
