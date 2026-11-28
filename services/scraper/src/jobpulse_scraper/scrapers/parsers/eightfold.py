from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def _irish_location(position: dict[str, Any]) -> str:
    locations = [str(item) for item in (position.get("locations") or [])]
    single = str(position.get("location") or "")
    candidates = [*locations, *([single] if single else [])]
    for candidate in candidates:
        if is_explicit_ireland_location(candidate):
            return candidate
    return ""


def parse_eightfold_positions(
    employer_name: str, host: str, positions: list[dict[str, Any]], details: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for position in positions:
        location = _irish_location(position)
        if not location:
            continue
        title = str(position.get("name") or "").strip()
        position_id = position.get("id")
        if not title or position_id is None:
            continue
        job_url = (
            str(position.get("canonicalPositionUrl") or position.get("canonical_position_url") or "")
            or f"https://{host}/careers/job/{position_id}"
        )
        if job_url in seen_urls:
            continue
        seen_urls.add(job_url)
        description = f"{employer_name} position: {title}. Location: {location}."
        detail = (details or {}).get(str(position_id))
        if detail:
            body = clean_html_description(str(detail.get("job_description") or ""))
            if body:
                description = body
        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": location,
                "employment_type": "See job post",
                "salary_text": None,
                "description": description,
                "url": job_url,
                "source": employer_name,
            }
        )
    return opportunities
