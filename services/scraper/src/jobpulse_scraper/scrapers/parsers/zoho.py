from __future__ import annotations

import html as html_lib
import json
import re
from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context

_JOBS_TAG = re.compile(r'<input[^>]*id=["\']jobs["\'][^>]*>', re.I | re.DOTALL)
_JOBS_VALUE = re.compile(r'value=["\'](.*?)["\']', re.I | re.DOTALL)


def parse_zoho_page(
    employer_name: str, host: str, page: str, details: dict[str, str] | None = None
) -> list[dict[str, Any]]:
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
        description = (details or {}).get(opening_id, "")
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
