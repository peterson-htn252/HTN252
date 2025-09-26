"""Persona API helper utilities."""
from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException

from .config import (
    PERSONA_API_KEY,
    PERSONA_API_VERSION,
    PERSONA_TEMPLATE_ID,
)

_API_BASE_URL = "https://withpersona.com/api/v1"


class PersonaNotFoundError(Exception):
    """Raised when a Persona inquiry cannot be located."""


def _require_config() -> None:
    missing = []
    if not PERSONA_API_KEY:
        missing.append("PERSONA_API_KEY")
    if not PERSONA_TEMPLATE_ID:
        missing.append("PERSONA_TEMPLATE_ID")

    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Persona configuration incomplete. Missing: {', '.join(missing)}",
        )


def _headers() -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {PERSONA_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if PERSONA_API_VERSION:
        headers["Persona-Version"] = PERSONA_API_VERSION
    return headers


def _request(
    method: str,
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    _require_config()

    url = f"{_API_BASE_URL}{path}"
    try:
        response = httpx.request(
            method,
            url,
            params=params,
            headers=_headers(),
            timeout=15.0,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:  # pragma: no cover - external API
        if exc.response.status_code == 404:
            raise PersonaNotFoundError(str(exc)) from exc
        detail = exc.response.text
        raise HTTPException(status_code=502, detail=f"Persona API error: {detail}") from exc
    except httpx.RequestError as exc:  # pragma: no cover - network failure
        raise HTTPException(status_code=502, detail=f"Persona API request failed: {exc}") from exc

    return response.json()


def fetch_inquiry(inquiry_id: str) -> Dict[str, Any]:
    """Fetch an inquiry by Persona inquiry identifier."""

    if not inquiry_id:
        raise HTTPException(status_code=400, detail="Missing inquiry_id")

    try:
        payload = _request("GET", f"/inquiries/{inquiry_id}")
    except PersonaNotFoundError as exc:  # pragma: no cover - external API
        raise HTTPException(status_code=404, detail="Persona inquiry not found") from exc

    data = payload.get("data") or {}
    if not data:
        raise HTTPException(status_code=404, detail="Persona inquiry not found")
    return data


def fetch_latest_inquiry_by_reference(reference_id: str) -> Dict[str, Any]:
    """Fetch the most recent inquiry matching a Persona reference id."""

    if not reference_id:
        raise HTTPException(status_code=400, detail="Missing reference_id")

    params = {
        "reference-id": reference_id,
        "page[size]": 1,
        "page[number]": 1,
    }

    payload = _request("GET", "/inquiries", params=params)
    data = payload.get("data")
    if not data:
        raise HTTPException(status_code=404, detail="Persona inquiry not found for reference id")

    if isinstance(data, list):
        return data[0] if data else {}
    return data


def _unwrap(value: Any) -> Any:
    """Reduce Persona field payloads down to primitive values."""

    if isinstance(value, dict):
        for key in ("value", "data", "raw", "display"):
            if key in value and value[key] is not None:
                return _unwrap(value[key])
        for candidate in value.values():
            resolved = _unwrap(candidate)
            if resolved not in (None, ""):
                return resolved
        return None

    if isinstance(value, (list, tuple)):
        for item in value:
            resolved = _unwrap(item)
            if resolved not in (None, ""):
                return resolved
        return None

    return value


def unwrap_value(value: Any) -> Any:
    """Public wrapper around internal unwrapping helper."""

    return _unwrap(value)


def _as_str(value: Any) -> Optional[str]:
    if value in (None, ""):
        return None
    return str(value)


def as_string(value: Any) -> Optional[str]:
    """Unwrap Persona payload and coerce to string if present."""

    return _as_str(_unwrap(value))


def extract_fields(inquiry: Dict[str, Any]) -> Dict[str, Any]:
    """Return a normalized dictionary of relevant inquiry details."""

    attributes = inquiry.get("attributes") or {}
    fields = attributes.get("fields") or {}

    def first(*keys: str) -> Optional[Any]:
        for key in keys:
            if key not in fields:
                continue
            candidate = _unwrap(fields[key])
            if candidate not in (None, ""):
                return candidate
        return None

    address_parts = [
        first("address-full", "address", "address-street-1", "address-line-1", "address_line1"),
        first("address-street-2", "address-line-2", "address_line2"),
        first("address-city", "city"),
        first("address-subdivision", "address-state", "state"),
        first("address-postal-code", "address-zip", "postal_code", "zip"),
        first("address-country-code", "address-country", "country"),
    ]
    address = ", ".join(str(part) for part in address_parts if part) or None

    scores: list[float] = []
    for key in (
        "document-authenticity-score",
        "document-confidence-score",
        "document-quality-score",
        "selfie-similarity-score",
        "selfie-liveness-score",
    ):
        value = unwrap_value(fields.get(key))
        if value is None:
            continue
        try:
            scores.append(float(value))
        except (TypeError, ValueError):
            continue

    risk_score_raw = unwrap_value(attributes.get("risk-score"))
    risk_score = None
    if risk_score_raw is not None:
        try:
            risk_score = float(risk_score_raw)
        except (TypeError, ValueError):
            risk_score = None

    if risk_score is not None:
        scores.append(risk_score)

    confidence = max(scores) if scores else None

    return {
        "first_name": as_string(first("name-first", "first_name", "firstName")),
        "last_name": as_string(first("name-last", "last_name", "lastName")),
        "date_of_birth": as_string(first("birthdate", "date-of-birth", "dob")),
        "id_number": as_string(first("government-id-number", "document-number", "id-number", "idNumber")),
        "address": address,
        "document_type": as_string(first("document-type", "documentType")),
        "confidence": confidence,
        "expiration_date": as_string(
            first(
                "document-expiration-date",
                "document-expiry-date",
                "expiration-date",
                "expirationDate",
            )
        ),
        "fields": fields,
    }
