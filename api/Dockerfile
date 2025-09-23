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

# Copy the warmup script
COPY warmup_models.py ./

# Warm up InsightFace model weights so they are baked into the image
RUN mkdir -p "${INSIGHTFACE_ROOT}" && python warmup_models.py

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
