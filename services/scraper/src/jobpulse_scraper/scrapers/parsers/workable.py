"""Pure workable vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def _location_text(job: dict[str, Any]) -> str:
    """Prefer an explicitly Irish location, otherwise the posting's first place."""
    fallback = ""
    locations = job.get("locations")
    if isinstance(locations, list):
        for entry in locations:
            if not isinstance(entry, dict):
                continue
            text = ", ".join(
                str(entry.get(key) or "").strip()
                for key in ("city", "region", "country")
                if str(entry.get(key) or "").strip()
            )
            if not text:
                continue
            if is_explicit_ireland_location(text):
                return text
            fallback = fallback or text
    top_level = ", ".join(
        str(job.get(key) or "").strip() for key in ("city", "state", "country") if str(job.get(key) or "").strip()
    )
    return top_level or fallback


def parse_workable_payload(employer_name: str, account: str, data: object) -> list[dict[str, Any]]:
    """Parse supplied public widget facts without transport or persistence."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    jobs = data.get("jobs") if isinstance(data, dict) else data
    if not isinstance(jobs, list):
        raise ValueError("Invalid workable listing")

    for job in jobs:
        if not isinstance(job, dict):
            continue
        title = str(job.get("title") or "").strip()
        if not title:
            continue
        location = _location_text(job)
        if not is_explicit_ireland_location(location):
            continue
        shortcode = str(job.get("shortcode") or "").strip()
        job_url = f"https://apply.workable.com/{account}/j/{shortcode}/"
        if job_url in seen_urls:
            continue
        seen_urls.add(job_url)
        description = clean_html_description(str(job.get("description") or ""))
        opportunities.append(
            {
                "external_id": shortcode,
                "title": title,
                "company": employer_name,
                "location": location,
                "employment_type": str(job.get("employment_type") or "See job post"),
                "salary_text": extract_salary_from_context(description, title),
                "description": description,
                "url": job_url,
                "source": employer_name,
            }
        )

    return opportunities
