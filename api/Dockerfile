# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    INSIGHTFACE_ROOT=/opt/insightface

# Install system build/runtime dependencies for scientific stack
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Warm up InsightFace model weights so they are baked into the image
RUN mkdir -p "${INSIGHTFACE_ROOT}" \
    && python - <<PY
import os
from insightface.app import FaceAnalysis

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
            return
        except Exception as exc:  # pragma: no cover - build time guard
            last_err = exc
            continue
    raise RuntimeError(f"Failed to pre-download InsightFace model '{name}': {last_err}")

for model_name in models:
    build(model_name)

print(f"InsightFace models cached under {root}")
PY

# Copy application source
COPY . .

# Ensure src package is importable
ENV PYTHONPATH=/app/src \
    PORT=8080

# Use a non-root user at runtime
RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app \
    && chown -R appuser:appuser "${INSIGHTFACE_ROOT}"
USER appuser

EXPOSE 8080

CMD ["uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8080"]
