#!/usr/bin/env python3
"""
Script to warm up InsightFace model weights during Docker build time.
This ensures the models are downloaded and cached in the Docker image.
"""

import os
import sys
import traceback
from insightface.app import FaceAnalysis


def main():
    root = os.environ.get("INSIGHTFACE_ROOT", "/opt/insightface")
    models = ["buffalo_l", "antelopev2", "buffalo_sc"]

    def build(name):
        last_err = None
        attempts = [
            dict(name=name, root=root, providers=["CPUExecutionProvider"], allowed_modules=["detection", "recognition"], download=True),
            dict(name=name, root=root, providers=["CPUExecutionProvider"], allowed_modules=["detection", "recognition"]),
            dict(name=name, root=root, providers=["CPUExecutionProvider"]),
            dict(name=name, root=root, allowed_modules=["detection", "recognition"]),
            dict(name=name, root=root),
        ]
        for kw in attempts:
            try:
                app = FaceAnalysis(**kw)
                app.prepare(ctx_id=-1, det_size=(640, 640))
            except Exception as exc:  # pragma: no cover - build time guard
                last_err = exc
                continue
            else:
                print(f"Cached InsightFace model '{name}' using options: {kw}")
                return True
        sys.stderr.write(
            "WARNING: Failed to pre-download InsightFace model '{}' after attempts:\n{}\n".format(
                name,
                traceback.format_exception_only(type(last_err), last_err)[0].strip() if last_err else "unknown error",
            )
        )
        return False

    failures = [model_name for model_name in models if not build(model_name)]
    if failures:
        sys.stderr.write(
            "WARNING: Proceeding without cached models: {}\n".format(", ".join(failures))
        )
    else:
        print(f"InsightFace models cached under {root}")


if __name__ == "__main__":
    main()
