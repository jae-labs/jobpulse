"""Breezy HR public JSON adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location


def _location_text(location: Any) -> str:
    if isinstance(location, dict):
        country = location.get("country")
        country_name = country.get("name") if isinstance(country, dict) else country
        return ", ".join(str(part) for part in (location.get("city"), country_name) if part)
    return location if isinstance(location, str) else ""


def extract_breezy_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from Breezy HR boards (``<tenant>.breezy.hr/json``)."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    match = re.search(r"https?://([a-zA-Z0-9-]+)\.breezy\.hr", listing_url)
    if not match and html_content:
        match = re.search(r"([a-zA-Z0-9-]+)\.breezy\.hr", html_content)
    if not match:
        return opportunities

    token = match.group(1)
    request = Request(
        f"https://{token}.breezy.hr/json",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with urlopen(request, timeout=10, context=get_ssl_context()) as response:
        data = json.loads(response.read().decode())
    if not isinstance(data, list):
        raise ValueError("Invalid breezy listing")
    for job in data:
        title = str(job.get("name") or "").strip()
        location = _location_text(job.get("location"))
        if not is_explicit_ireland_location(location):
            continue
        job_url = job.get("url")
        job_type = job.get("type")
        employment = job_type.get("name") if isinstance(job_type, dict) else None
        salary = str(job.get("salary") or "") or extract_salary_from_context(location, title)
        if title and job_url and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": employment or "See job post",
                    "salary_text": salary,
                    "description": f"{employer_name} position: {title}. Location: {location}.",
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
