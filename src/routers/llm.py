# routers/npo.py
from __future__ import annotations

import os
import re
import json
from typing import Dict, Any, List, Optional, Generator

import requests
from fastapi import APIRouter, Body, Query
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from cerebras.cloud.sdk import Cerebras

# ----------------------- Config -----------------------
CEREBRAS_MODEL = os.getenv("CEREBRAS_MODEL", "llama-3.3-70b")
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "10"))
WIKI_UA = os.getenv("WIKI_UA", "NPO-Summarizer/1.0 (+contact@example.com)")
ENABLE_PROPUBLICA = os.getenv("ENABLE_PROPUBLICA", "1") not in ("0", "false", "False")

client = Cerebras(api_key=os.environ.get("CEREBRAS_API_KEY"))

router = APIRouter(prefix="/npo", tags=["npo"])

# --------------------- Pydantic -----------------------

class SummarizeReq(BaseModel):
    organization: str = Field(..., min_length=2)
    ein: Optional[str] = Field(None, description="US EIN to fetch ProPublica data")
    temperature: Optional[float] = Field(0.3, ge=0.0, le=1.0)
    country: Optional[str] = Field(None, description="Optional hint for disambiguation")

class EinLookupReq(BaseModel):
    organization: str = Field(..., min_length=2)
    state: str | None = Field(None, description="Optional 2-letter US state filter, e.g. 'CA'")

@router.post("/ein")
def lookup_ein(payload: EinLookupReq, limit: int = Query(5, ge=1, le=25)):
    """
    Look up EINs by organization name (no scraping).
    1) ProPublica Nonprofit Explorer /search.json
    2) Fallback: Wikidata P1297 via wbsearchentities + Special:EntityData
    """
    org = payload.organization.strip()
    state = (payload.state or "").strip().upper()

    # --- 1) ProPublica Nonprofit Explorer search ---
    try:
        params = {"q": org, "page": 0}
        if state:
            params["state[id]"] = state  # requests will url-encode the brackets
        r = requests.get(
            "https://projects.propublica.org/nonprofits/api/v2/search.json",
            params=params,
            timeout=HTTP_TIMEOUT,
            headers={"User-Agent": WIKI_UA},
        )
        if r.status_code == 200:
            j = r.json()
            orgs = (j.get("organizations") or [])[:limit]
            results = []
            for o in orgs:
                results.append({
                    "name": o.get("name"),
                    "ein": str(o.get("ein")) if o.get("ein") is not None else None,
                    "strein": o.get("strein"),
                    "city": o.get("city"),
                    "state": o.get("state"),
                    "ntee_code": o.get("ntee_code"),
                    "subseccd": o.get("subseccd"),
                    "guidestar_url": o.get("guidestar_url"),
                    "nccs_url": o.get("nccs_url"),
                    "propublica_org_url": f"https://projects.propublica.org/nonprofits/organizations/{o.get('ein')}" if o.get("ein") else None,
                })
            if results:
                return {"source": "propublica", "results": results}
    except Exception:
        pass

    # --- 2) Fallback: Wikidata (P1297 = EIN) ---
    try:
        # find QID by name
        s = requests.get(
            "https://www.wikidata.org/w/api.php",
            params={
                "action": "wbsearchentities",
                "search": org,
                "language": "en",
                "format": "json",
                "limit": 3,
            },
            headers={"User-Agent": WIKI_UA},
            timeout=HTTP_TIMEOUT,
        )
        qid = None
        if s.status_code == 200:
            hits = s.json().get("search", [])
            if hits:
                qid = hits[0].get("id")

        if qid:
            ent = requests.get(
                f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json",
                headers={"User-Agent": WIKI_UA},
                timeout=HTTP_TIMEOUT,
            )
            if ent.status_code == 200:
                data = ent.json()
                claims = data.get("entities", {}).get(qid, {}).get("claims", {})
                # P1297 = EIN
                if "P1297" in claims:
                    ein = claims["P1297"][0]["mainsnak"]["datavalue"]["value"]
                    # try to pick a label
                    label = data.get("entities", {}).get(qid, {}).get("labels", {}).get("en", {}).get("value", org)
                    return {
                        "source": "wikidata",
                        "results": [{"name": label, "ein": ein, "strein": None, "city": None, "state": None}],
                    }
    except Exception:
        pass

    return JSONResponse(status_code=404, content={"error": f"No EIN found for '{org}'"})

# --------------------- Helpers (no scraping) ---------------------

def wiki_search(title: str) -> Optional[str]:
    """Return best Wikipedia page title for the query (MediaWiki API)."""
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "list": "search",
        "srsearch": title,
        "srlimit": 5,
        "format": "json",
        "utf8": 1,
    }
    try:
        r = requests.get(url, params=params, headers={"User-Agent": WIKI_UA}, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        results = r.json().get("query", {}).get("search", [])
        return results[0].get("title") if results else None
    except Exception:
        return None

def wiki_summary(page_title: str) -> Optional[Dict[str, Any]]:
    """Wikipedia REST summary for a page (no HTML)."""
    if not page_title:
        return None
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{page_title}"
    try:
        r = requests.get(url, headers={"User-Agent": WIKI_UA}, timeout=HTTP_TIMEOUT)
        if r.status_code != 200:
            return None
        s = r.json()
        return {
            "title": s.get("title"),
            "extract": s.get("extract"),
            "url": s.get("content_urls", {}).get("desktop", {}).get("page"),
            "lang": s.get("lang"),
            "description": s.get("description"),
        }
    except Exception:
        return None

def wikidata_lookup(query: str) -> Optional[str]:
    """Find a Wikidata QID for the org name."""
    url = "https://www.wikidata.org/w/api.php"
    params = {
        "action": "wbsearchentities",
        "search": query,
        "language": "en",
        "format": "json",
        "limit": 5,
    }
    try:
        r = requests.get(url, params=params, headers={"User-Agent": WIKI_UA}, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        hits = r.json().get("search", [])
        return hits[0].get("id") if hits else None
    except Exception:
        return None

def wikidata_entity(qid: str) -> Optional[Dict[str, Any]]:
    """Fetch selected claims from Wikidata entity JSON."""
    if not qid:
        return None
    url = f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
    try:
        r = requests.get(url, headers={"User-Agent": WIKI_UA}, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        data = r.json()
        ent = data.get("entities", {}).get(qid, {})
        labels = ent.get("labels", {})
        claims = ent.get("claims", {})

        def get_time(prop: str) -> Optional[str]:
            try:
                t = claims[prop][0]["mainsnak"]["datavalue"]["value"]["time"]
                m = re.match(r"^\+?(\d{4})-(\d{2})-(\d{2})", t)
                return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None
            except Exception:
                return None

        def get_url(prop: str) -> Optional[str]:
            try:
                return claims[prop][0]["mainsnak"]["datavalue"]["value"]
            except Exception:
                return None

        def get_item_label(prop: str) -> Optional[str]:
            try:
                q = claims[prop][0]["mainsnak"]["datavalue"]["value"]["id"]
                return data["entities"][q]["labels"]["en"]["value"]
            except Exception:
                return None

        def get_string(prop: str) -> Optional[str]:
            try:
                return claims[prop][0]["mainsnak"]["datavalue"]["value"]
            except Exception:
                return None

        return {
            "qid": qid,
            "label": labels.get("en", {}).get("value"),
            "founded": get_time("P571"),                 # inception
            "headquarters": get_item_label("P159"),
            "country": get_item_label("P17"),
            "website": get_url("P856"),
            "industry": get_item_label("P452"),
            "ein": get_string("P1297"),                  # US EIN, if present
        }
    except Exception:
        return None

def propublica_org_by_ein(ein: str) -> Optional[Dict[str, Any]]:
    """ProPublica Nonprofit Explorer JSON by EIN (no key required)."""
    if not ein:
        return None
    url = f"https://projects.propublica.org/nonprofits/api/v2/organizations/{ein}.json"
    try:
        r = requests.get(url, timeout=HTTP_TIMEOUT, headers={"User-Agent": WIKI_UA})
        if r.status_code != 200:
            return None
        j = r.json()
        org = j.get("organization") or {}
        filings = j.get("filings_with_data") or []
        return {
            "ein": org.get("ein"),
            "name": org.get("name"),
            "classification": org.get("ntee_code"),
            "ruling_date": org.get("ruling_date"),
            "city": org.get("city"),
            "state": org.get("state"),
            "total_revenue": org.get("total_revenue"),
            "total_expenses": org.get("total_expenses"),
            "website": org.get("website"),
            "filings_recent": [
                {
                    "tax_prd_yr": f.get("tax_prd_yr"),
                    "totfuncexpns": f.get("totfuncexpns"),
                    "totrevenue": f.get("totrevenue"),
                    "pf990_ind": f.get("pf990_ind"),
                    "formtype": f.get("formtype"),
                } for f in filings[:5]
            ],
        }
    except Exception:
        return None

def build_messages(org_name: str, payload: Dict[str, Any]) -> List[Dict[str, str]]:
    sys = (
        "You are a nonprofit analyst. Using **only** the structured API data provided, "
        "write a concise, factual profile of the organization for a general audience. "
        "Do not invent facts. If important fields are missing, say so."
        "If facts are missing, leave them out entirely (do not say 'unknown')."
    )
    user = {
        "organization": org_name,
        "data": payload,
        "instructions": {
            "sections": [
                "Mission (1 sentence)",
                "What they do (programs/services, beneficiaries, geographies)",
                "Values / DEI (only if present in data)",
                "Governance & identifiers (EIN, legal form, HQ, founded year)",
                "Size & finances (revenue/expenses, recent filings highlights)",
                "Ratings / watchdog notes (if present)",
                "Donate / volunteer (link if present)",
                "Controversies or issues (only if present)",
                "Key sources (URLs)"
            ],
            "style": "bullet points + short paragraphs; include dates and numbers where available"
        }
    }
    return [
        {"role": "system", "content": sys},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]

def stream_llm(messages: List[Dict[str, str]], temperature: float = 0.3) -> Generator[str, None, None]:
    stream = client.chat.completions.create(
        messages=messages,
        model=CEREBRAS_MODEL,
        stream=True,
        max_completion_tokens=20000,
        temperature=temperature,
        top_p=0.8
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content or ""
        if delta:
            yield delta

# ------------------------ Routes ------------------------

@router.get("/health")
def health():
    return {"ok": True, "model": CEREBRAS_MODEL}

@router.post("/summarize")
def summarize(
    payload: SummarizeReq = Body(...),
    fmt: str = Query("text", regex="^(text|json)$"),
):
    """
    Summarize an organization using official APIs (no scraping).
    - Wikipedia (REST) + Wikidata for general facts/links
    - ProPublica Nonprofit Explorer if EIN is provided
    Returns plaintext streaming by default, or JSON if `?fmt=json`.
    """
    org = payload.organization.strip()
    ein = (payload.ein or "").strip()
    temperature = payload.temperature or 0.3

    # 1) Wikipedia + Wikidata
    page = wiki_search(org if not payload.country else f"{org} {payload.country}")
    wiki = wiki_summary(page) if page else None

    qid = wikidata_lookup(org)
    wd = wikidata_entity(qid) if qid else None

    # 2) ProPublica by EIN (optional)
    pp = propublica_org_by_ein(ein) if (ENABLE_PROPUBLICA and ein) else None

    # 3) Build structured payload for the model
    sources = []
    if wiki and wiki.get("url"): sources.append(wiki["url"])
    if wd and wd.get("website"): sources.append(wd["website"])
    if pp and pp.get("ein"): sources.append(f"https://projects.propublica.org/nonprofits/organizations/{pp['ein']}")

    data = {
        "wikipedia": wiki,     # title, description, extract, url
        "wikidata": wd,        # founded, hq, country, website, ein (if present)
        "propublica": pp,      # 990 highlights (if EIN provided)
        "sources": sources
    }

    if not any([wiki, wd, pp]):
        return JSONResponse(
            status_code=404,
            content={
                "organization": org,
                "error": "No structured sources found (Wikipedia/Wikidata/ProPublica)",
                "hint": "Provide an EIN for U.S. orgs to query ProPublica."
            }
        )

    messages = build_messages(org, data)

    if fmt == "json":
        text = "".join(list(stream_llm(messages, temperature=temperature)))
        return JSONResponse({
            "organization": org,
            "summary": text,
            "sources": sources
        })

    def generator():
        yield f"# {org}\n\n"
        for chunk in stream_llm(messages, temperature=temperature):
            yield chunk

    return StreamingResponse(generator(), media_type="text/plain; charset=utf-8")
