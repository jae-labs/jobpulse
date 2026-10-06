"""Zoho Recruit career-site adapter."""

from __future__ import annotations

import html as html_lib
import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_html_description
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location

_JOBS_TAG = re.compile(r'<input[^>]*id=["\']jobs["\'][^>]*>', re.I | re.DOTALL)
_JOBS_VALUE = re.compile(r'value=["\'](.*?)["\']', re.I | re.DOTALL)
_DESCRIPTION = re.compile(r'"Job_Description"\s*:\s*"((?:[^"\\]|\\.)*)"', re.I)
_MAX_DETAILS = 60


def _fetch(url: str, timeout: int = 15) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    with urlopen(request, timeout=timeout, context=get_ssl_context()) as response:
        return response.read().decode("utf-8", errors="replace")


def _description(host: str, opening_id: str) -> str:
    try:
        page = _fetch(f"https://{host}/jobs/Careers/{opening_id}")
    except Exception:
        return ""
    match = _DESCRIPTION.search(page)
    if not match:
        return ""
    try:
        raw = json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        raw = match.group(1)
    return clean_html_description(raw)


def extract_zoho_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from a Zoho Recruit careers page."""
    match = re.search(r"https?://([a-z0-9.-]+\.zohorecruit\.[a-z.]+)", listing_url, re.I)
    if not match and html_content:
        match = re.search(r"https?://([a-z0-9.-]+\.zohorecruit\.[a-z.]+)", html_content, re.I)
    if not match:
        return []
    host = match.group(1)
    page = _fetch(f"https://{host}/jobs/Careers")
    tag_match = _JOBS_TAG.search(page)
    value_match = _JOBS_VALUE.search(tag_match.group(0)) if tag_match else None
    if not value_match:
        raise ValueError("Missing Zoho listing")
    try:
        openings = json.loads(html_lib.unescape(value_match.group(1)))
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid Zoho listing") from exc
    if not isinstance(openings, list):
        raise ValueError("Invalid Zoho listing")

    opportunities: list[dict[str, Any]] = []
    for opening in openings:
        if not opening.get("Publish"):
            continue
        title = str(opening.get("Posting_Title") or "").strip()
        location = ", ".join(
            part for part in (str(opening.get("City") or "").strip(), str(opening.get("Country") or "").strip()) if part
        )
        if not is_explicit_ireland_location(location):
            continue
        opening_id = str(opening.get("id") or "").strip()
        if not title or not opening_id:
            continue
        description = _description(host, opening_id) if len(opportunities) < _MAX_DETAILS else ""
        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": location,
                "employment_type": "See job post",
                "salary_text": extract_salary_from_context(description, title),
                "description": description or f"{employer_name} position: {title}. Location: {location}.",
                "url": f"https://{host}/jobs/Careers/{opening_id}",
                "source": employer_name,
            }
        )
    return opportunities
