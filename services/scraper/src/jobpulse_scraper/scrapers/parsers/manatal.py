from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def _employment_type(value: str) -> str:
    return {
        "full_time": "Full-Time",
        "part_time": "Part-Time",
        "contract": "Contract",
        "temporary": "Temporary",
        "freelance": "Freelance",
    }.get(value, "See job post")


def parse_manatal_payload(employer_name: str, slug: str, payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise ValueError("Invalid Manatal listing")
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
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
    return opportunities
