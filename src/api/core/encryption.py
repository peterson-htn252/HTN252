"""Helpers for encrypting and decrypting sensitive vectors such as face embeddings."""

import json
from functools import lru_cache
from typing import Iterable

import numpy as np
from cryptography.fernet import Fernet, InvalidToken

from .config import FACE_EMBEDDING_KEY


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    if not FACE_EMBEDDING_KEY:
        raise RuntimeError("FACE_EMBEDDING_KEY is not configured")
    try:
        key_bytes = FACE_EMBEDDING_KEY.encode()
        return Fernet(key_bytes)
    except Exception as exc:  # pragma: no cover - defensive
        raise RuntimeError(
            "FACE_EMBEDDING_KEY must be a urlsafe base64-encoded 32-byte key"
        ) from exc


def encrypt_bytes(data: bytes) -> str:
    """Encrypt arbitrary bytes and return a UTF-8 token."""
    token = _get_fernet().encrypt(data)
    return token.decode()


def decrypt_bytes(token: str) -> bytes:
    """Decrypt a UTF-8 token produced by ``encrypt_bytes``."""
    try:
        return _get_fernet().decrypt(token.encode())
    except InvalidToken as exc:
        raise ValueError("Invalid ciphertext for FACE_EMBEDDING_KEY") from exc


def encrypt_face_embedding(vec: Iterable[float]) -> str:
    """Encrypt a face embedding vector."""
    arr = np.asarray(list(vec), dtype=np.float32)
    payload = json.dumps([float(x) for x in arr.tolist()]).encode()
    return encrypt_bytes(payload)


def decrypt_face_embedding(ciphertext: str) -> np.ndarray:
    """Decrypt a previously encrypted face embedding vector."""
    payload = decrypt_bytes(ciphertext)
    data = json.loads(payload.decode())
    return np.asarray(data, dtype=np.float32)

