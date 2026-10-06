"""Pinpoint public postings adapter."""

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


def _location_text(location: Any) -> str:
    if not isinstance(location, dict):
        return ""
    return ", ".join(
        str(part) for part in (location.get("city"), location.get("province"), location.get("name")) if part
    )


def extract_pinpoint_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from Pinpoint boards (``<tenant>.pinpointhq.com/postings.json``)."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    match = re.search(r"https?://([a-zA-Z0-9-]+)\.pinpointhq\.com", listing_url)
    if not match and html_content:
        match = re.search(r"([a-zA-Z0-9-]+)\.pinpointhq\.com", html_content)
    if not match:
        return opportunities

    token = match.group(1)
    request = Request(
        f"https://{token}.pinpointhq.com/postings.json",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with urlopen(request, timeout=10, context=get_ssl_context()) as response:
        payload = json.loads(response.read().decode())
    jobs = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(jobs, list):
        raise ValueError("Invalid pinpoint listing")
    for job in jobs:
        title = str(job.get("title") or "").strip()
        location = _location_text(job.get("location"))
        if not is_explicit_ireland_location(location):
            continue
        job_url = job.get("url")
        desc = clean_html_description(
            " ".join(
                str(job.get(key) or "") for key in ("description", "key_responsibilities", "skills_knowledge_expertise")
            )
        )
        employment = job.get("employment_type_text") or job.get("employment_type") or "See job post"
        salary = extract_salary_from_context(desc or location, title)
        if title and job_url and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": location,
                    "employment_type": employment,
                    "salary_text": salary,
                    "description": desc or f"{employer_name} position: {title}. Location: {location}.",
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
