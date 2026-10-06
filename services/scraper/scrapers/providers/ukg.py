"""UKG Pro Recruiting (UltiPro) job board adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location

_PAGE_SIZE = 100
_MAX_PAGES = 20
_IRELAND_COUNTRY_CODES = {"IRL", "IE"}


def _location_text(locations: Any) -> str:
    if not isinstance(locations, list):
        return ""
    parts = [
        str(loc.get("LocalizedDescription") or loc.get("LocalizedName") or "").strip()
        for loc in locations
        if isinstance(loc, dict)
    ]
    return "; ".join(part for part in parts if part)


def _is_irish(locations: Any, text: str) -> bool:
    if isinstance(locations, list):
        for loc in locations:
            if not isinstance(loc, dict):
                continue
            address = loc.get("Address") or {}
            country = address.get("Country") if isinstance(address, dict) else None
            code = str(country.get("Code") or "").upper() if isinstance(country, dict) else ""
            if code in _IRELAND_COUNTRY_CODES:
                return True
    return is_explicit_ireland_location(text)


def extract_ukg_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from UKG Pro Recruiting boards (``LoadSearchResults`` API)."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    match = re.search(r"https?://([^/]+)/([^/]+)/JobBoard/([0-9a-fA-F-]{36})", listing_url)
    if not match and html_content:
        match = re.search(r"https?://([^/]+)/([^/]+)/JobBoard/([0-9a-fA-F-]{36})", html_content)
    if not match:
        return opportunities

    host, tenant, board = match.groups()
    board_url = f"https://{host}/{tenant}/JobBoard/{board}"
    for page in range(_MAX_PAGES):
        body = json.dumps(
            {"opportunitySearch": {"Top": _PAGE_SIZE, "Skip": page * _PAGE_SIZE, "QueryString": "", "OrderBy": []}}
        ).encode()
        request = Request(
            f"{board_url}/JobBoardView/LoadSearchResults",
            data=body,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        with urlopen(request, timeout=15, context=get_ssl_context()) as response:
            payload = json.loads(response.read().decode())
        if not isinstance(payload, dict) or not isinstance(payload.get("opportunities"), list):
            raise ValueError("Invalid UKG listing")
        jobs = payload["opportunities"]
        if not jobs:
            break
        for job in jobs:
            title = str(job.get("Title") or "").strip()
            locations = job.get("Locations")
            location = _location_text(locations)
            if not _is_irish(locations, location):
                continue
            job_id = job.get("Id")
            job_url = f"{board_url}/OpportunityDetail?opportunityId={job_id}"
            employment = "Full-Time" if job.get("FullTime") else "See job post"
            salary = extract_salary_from_context(location, title)
            if title and job_id and job_url not in seen_urls:
                seen_urls.add(job_url)
                opportunities.append(
                    {
                        "title": title,
                        "company": employer_name,
                        "location": location,
                        "employment_type": employment,
                        "salary_text": salary,
                        "description": f"{employer_name} position: {title}. Location: {location}.",
                        "url": job_url,
                        "source": employer_name,
                    }
                )
        total = payload.get("totalCount")
        if not isinstance(total, int) or (page + 1) * _PAGE_SIZE >= total:
            break

    else:
        raise ValueError("ukg listing exceeded the page limit")

    return opportunities
