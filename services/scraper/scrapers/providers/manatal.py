"""Manatal career-page adapter (the ATS behind careers-page.com)."""

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

_API = "https://open.api.manatal.com/open/v3/career-page/{slug}/jobs/"
_MAX_PAGES = 20


def _slug(listing_url: str) -> str:
    match = re.search(r"careers-page\.com/([A-Za-z0-9_-]+)", listing_url)
    if match:
        return match.group(1)
    match = re.search(r"career-page/([A-Za-z0-9_-]+)/jobs", listing_url)
    return match.group(1) if match else ""


def _get_json(url: str) -> dict[str, Any] | None:
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urlopen(request, timeout=15, context=get_ssl_context()) as response:
            payload = json.loads(response.read().decode())
            return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _employment_type(value: str) -> str:
    return {
        "full_time": "Full-Time",
        "part_time": "Part-Time",
        "contract": "Contract",
        "temporary": "Temporary",
        "freelance": "Freelance",
    }.get(value, "See job post")


def extract_manatal_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from a Manatal career page (full bodies inline)."""
    slug = _slug(listing_url)
    if not slug:
        return []
    url: str | None = _API.format(slug=slug)
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for _ in range(_MAX_PAGES):
        if not url:
            break
        payload = _get_json(url)
        if not payload:
            break
        for posting in payload.get("results") or []:
            title = str(posting.get("position_name") or "").strip()
            location = str(posting.get("location_display") or "").strip() or ", ".join(
                part for part in (posting.get("city"), posting.get("state"), posting.get("country")) if part
            )
            if not is_explicit_ireland_location(location):
                continue
            hash_id = str(posting.get("hash") or "").strip()
            if not title or not hash_id or hash_id in seen:
                continue
            seen.add(hash_id)
            description = clean_html_description(str(posting.get("description") or ""))
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": _employment_type(str(posting.get("contract_details") or "")),
                    "salary_text": extract_salary_from_context(description, title),
                    "description": description or f"{employer_name} position: {title}. Location: {location}.",
                    "url": f"https://www.careers-page.com/{slug}/job/{hash_id}",
                    "source": employer_name,
                }
            )
        url = payload.get("next") or None
    return opportunities
