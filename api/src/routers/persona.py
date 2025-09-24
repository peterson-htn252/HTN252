from __future__ import annotations

import uuid
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.config import (
    PERSONA_AVAILABLE,
    PERSONA_ENV,
    PERSONA_TEMPLATE_ID,
)

router = APIRouter(prefix="/persona", tags=["persona"])


class HostedLinkRequest(BaseModel):
    account_id: Optional[str] = Field(
        default=None,
        description="Existing account identifier to embed in the reference ID",
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


def _ensure_persona_ready() -> None:
    if PERSONA_AVAILABLE:
        return

    missing = []
    if not PERSONA_TEMPLATE_ID:
        missing.append("PERSONA_TEMPLATE_ID")

    detail = "Persona hosted flow is not configured"
    if missing:
        detail = f"{detail}. Missing: {', '.join(missing)}"
    raise HTTPException(status_code=503, detail=detail)


@router.post("/hosted-link", response_model=HostedLinkResponse)
def create_hosted_link(body: HostedLinkRequest) -> HostedLinkResponse:
    _ensure_persona_ready()

    reference_id = body.reference_id or body.account_id or str(uuid.uuid4())

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
