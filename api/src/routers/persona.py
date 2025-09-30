from __future__ import annotations

import uuid
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.config import (
    PERSONA_API_KEY,
    PERSONA_AVAILABLE,
    PERSONA_ENV,
    PERSONA_TEMPLATE_ID,
)
from core.persona_client import (
    extract_fields,
    fetch_inquiry,
    fetch_latest_inquiry_by_reference,
    unwrap_value,
    as_string,
)

router = APIRouter(prefix="/persona", tags=["persona"])


class HostedLinkRequest(BaseModel):
    ngo_id: Optional[str] = Field(
        default=None,
        description="Existing NGO identifier to embed in the reference ID",
    )
    account_id: Optional[str] = Field(
        default=None,
        description="Deprecated: use ngo_id instead",
    )
    reference_id: Optional[str] = Field(
        default=None,
        description="Override the generated reference identifier for the Persona inquiry",
    )
    redirect_uri: Optional[str] = Field(
        default=None,
        description="Optional redirect URI passed to Persona once the hosted flow completes",
    )
    state: Optional[str] = Field(
        default=None,
        description="Opaque state string forwarded to the hosted flow redirect",
    )


class HostedLinkResponse(BaseModel):
    url: str
    reference_id: str
    environment: str
    template_id: str


class InquirySummaryRequest(BaseModel):
    inquiry_id: Optional[str] = Field(
        default=None,
        description="Persona inquiry identifier returned via webhook or API",
    )
    reference_id: Optional[str] = Field(
        default=None,
        description="Reference identifier that was supplied when creating the hosted link",
    )
    ngo_id: Optional[str] = Field(
        default=None,
        description="Associated NGO identifier for downstream bookkeeping",
    )


class InquirySummary(BaseModel):
    inquiry_id: str
    status: Optional[str]
    reference_id: Optional[str]
    ngo_id: Optional[str]
    account_id: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    date_of_birth: Optional[str]
    id_number: Optional[str]
    address: Optional[str]
    document_type: Optional[str]
    confidence: Optional[float]
    expiration_date: Optional[str]
    decision: Optional[str]
    risk_score: Optional[float]
    fields: Dict[str, Any]
    environment: str


def _ensure_template_ready() -> None:
    if PERSONA_TEMPLATE_ID:
        return
    raise HTTPException(status_code=503, detail="Persona hosted flow is not configured. Missing: PERSONA_TEMPLATE_ID")


def _ensure_persona_ready() -> None:
    if PERSONA_AVAILABLE:
        return

    missing = []
    if not PERSONA_TEMPLATE_ID:
        missing.append("PERSONA_TEMPLATE_ID")
    if not PERSONA_API_KEY:
        missing.append("PERSONA_API_KEY")

    detail = "Persona identity verification is not fully configured"
    if missing:
        detail = f"{detail}. Missing: {', '.join(missing)}"
    raise HTTPException(status_code=503, detail=detail)


@router.post("/hosted-link", response_model=HostedLinkResponse)
def create_hosted_link(body: HostedLinkRequest) -> HostedLinkResponse:
    _ensure_template_ready()

    reference_id = body.reference_id or body.ngo_id or body.account_id or str(uuid.uuid4())

    params = {
        "inquiry-template-id": PERSONA_TEMPLATE_ID,
        "reference-id": reference_id,
    }

    environment = (PERSONA_ENV or "sandbox").lower()
    if environment not in ("prod", "production"):
        params["environment"] = environment

    if body.redirect_uri:
        params["redirect-uri"] = body.redirect_uri
    if body.state:
        params["state"] = body.state

    hosted_url = f"https://withpersona.com/verify?{urlencode(params)}"

    return HostedLinkResponse(
        url=hosted_url,
        reference_id=reference_id,
        environment=environment,
        template_id=PERSONA_TEMPLATE_ID,
    )


@router.post("/inquiries", response_model=InquirySummary)
def fetch_inquiry_summary(body: InquirySummaryRequest) -> InquirySummary:
    _ensure_persona_ready()

    if not body.inquiry_id and not body.reference_id:
        raise HTTPException(status_code=400, detail="Provide inquiry_id or reference_id")

    if body.inquiry_id:
        inquiry = fetch_inquiry(body.inquiry_id)
    else:
        inquiry = fetch_latest_inquiry_by_reference(body.reference_id or "")

    inquiry_id = as_string(inquiry.get("id")) or body.inquiry_id
    if not inquiry_id:
        raise HTTPException(status_code=502, detail="Persona inquiry response missing inquiry id")

    attributes = inquiry.get("attributes") or {}
    reference_id = as_string(attributes.get("reference-id")) or body.reference_id

    normalized = extract_fields(inquiry)

    risk_raw = unwrap_value(attributes.get("risk-score"))
    risk_score = None
    if risk_raw is not None:
        try:
            risk_score = float(risk_raw)
        except (TypeError, ValueError):
            risk_score = None

    return InquirySummary(
        inquiry_id=inquiry_id,
        status=as_string(attributes.get("status")),
        reference_id=reference_id,
        ngo_id=body.ngo_id,
        account_id=body.account_id,
        first_name=normalized.get("first_name"),
        last_name=normalized.get("last_name"),
        date_of_birth=normalized.get("date_of_birth"),
        id_number=normalized.get("id_number"),
        address=normalized.get("address"),
        document_type=normalized.get("document_type"),
        confidence=normalized.get("confidence"),
        expiration_date=normalized.get("expiration_date"),
        decision=attributes.get("decision"),
        risk_score=risk_score,
        fields=normalized.get("fields") or {},
        environment=PERSONA_ENV,
    )
