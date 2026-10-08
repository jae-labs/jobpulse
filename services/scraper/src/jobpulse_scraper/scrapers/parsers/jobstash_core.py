"""Pure supplied-source parsing for jobstash acquisition workflows."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def _location_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return ", ".join(str(part) for part in (value.get("city"), value.get("country")) if part)
    return ""


def extract_jobstash_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        title = str(item.get("title") or "").strip()
        location = _location_text(item.get("location"))
        if not title or not is_explicit_ireland_location(location):
            continue
        organization = item.get("organization") or {}
        company = str(organization.get("name") or "").strip() if isinstance(organization, dict) else ""
        url = str(item.get("url") or "").strip() or f"https://jobstash.xyz/jobs/{item.get('shortUUID', '')}/details"
        if url in seen:
            continue
        seen.add(url)
        description = clean_html_description(str(item.get("description") or item.get("summary") or ""))
        opportunities.append(
            {
                "title": title,
                "company": company or "Employer (via JobStash)",
                "location": location or "Ireland",
                "employment_type": str(item.get("commitment") or "See job post"),
                "salary_text": extract_salary_from_context(description, title),
                "description": description or f"{title} ({location}).",
                "url": url,
                "source": "JobStash",
            }
        )
    return opportunities
