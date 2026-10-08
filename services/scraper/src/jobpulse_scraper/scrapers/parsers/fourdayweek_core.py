"""Pure supplied-source parsing for fourdayweek acquisition workflows."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def _location_text(locations: Any) -> str:
    if not isinstance(locations, list):
        return ""
    parts: list[str] = []
    for loc in locations:
        if isinstance(loc, dict):
            parts.append(", ".join(str(loc.get(key) or "").strip() for key in ("city", "country") if loc.get(key)))
        elif isinstance(loc, str):
            parts.append(loc)
    return "; ".join(part for part in parts if part)


def extract_fourdayweek_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        title = str(item.get("title") or "").strip()
        location = _location_text(item.get("locations"))
        if not title or not is_explicit_ireland_location(location):
            continue
        url = str(item.get("url") or "").strip() or f"https://4dayweek.io/job/{item.get('slug', '')}"
        if url in seen:
            continue
        seen.add(url)
        description = clean_html_description(str(item.get("description") or ""))
        company = item.get("company")
        if isinstance(company, dict):
            company = company.get("name")
        company = company.strip() if isinstance(company, str) else ""
        opportunities.append(
            {
                "title": title,
                "company": company or "Employer (via 4dayweek)",
                "location": location or "Ireland",
                "employment_type": str(item.get("contract_type") or "See job post"),
                "salary_text": extract_salary_from_context(description, title),
                "description": description or f"{title} ({location}).",
                "url": url,
                "source": "4dayweek.io",
            }
        )
    return opportunities
