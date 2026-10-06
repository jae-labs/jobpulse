"""Phenom People career-site adapter (POST ``/widgets``)."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_html_description
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location

_PAGE = 100
_MAX_PAGES = 20
_MAX_DETAILS = 60


def _post(host: str, body: dict[str, Any]) -> dict[str, Any] | None:
    data = json.dumps(body).encode()
    request = Request(
        f"https://{host}/widgets",
        data=data,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=15, context=get_ssl_context()) as response:
            payload = json.loads(response.read().decode())
            return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _job_url(host: str, locale: str, seq: str) -> str:
    if "_" in locale:
        lang, country = locale.split("_", 1)
        if lang and country:
            return f"https://{host}/{country.lower()}/{lang.lower()}/job/{seq}"
    return f"https://{host}/job/{seq}"


def extract_phenom_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from a Phenom career site."""
    match = re.search(r"https?://([^/?#]+)", listing_url)
    host = match.group(1).lower() if match else ""
    if not host or "." not in host:
        return []

    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in range(_MAX_PAGES):
        payload = _post(
            host,
            {"deviceType": "desktop", "ddoKey": "refineSearch", "jobs": True, "from": page * _PAGE, "size": _PAGE},
        )
        if not payload:
            break
        jobs = ((payload.get("refineSearch") or {}).get("data") or {}).get("jobs") or []
        if not jobs:
            break
        for posting in jobs:
            location = str(posting.get("cityState") or "").strip()
            if not is_explicit_ireland_location(location):
                continue
            seq = str(posting.get("jobSeqNo") or "").strip()
            title = str(posting.get("title") or "").strip()
            if not seq or not title or seq in seen:
                continue
            seen.add(seq)
            description = ""
            if len(seen) <= _MAX_DETAILS:
                detail = _post(
                    host,
                    {"deviceType": "desktop", "ddoKey": "jobDetail", "pageName": "job-details", "jobSeqNo": seq},
                )
                job = (((detail or {}).get("jobDetail") or {}).get("data") or {}).get("job") or {}
                description = clean_html_description(str(job.get("description") or ""))
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": "See job post",
                    "salary_text": extract_salary_from_context(description, title),
                    "description": description or f"{employer_name} position: {title}. Location: {location}.",
                    "url": _job_url(host, str(posting.get("locale") or ""), seq),
                    "source": employer_name,
                }
            )
        if len(jobs) < _PAGE:
            break
    return opportunities
