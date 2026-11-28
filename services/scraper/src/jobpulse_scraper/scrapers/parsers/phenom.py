from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_explicit_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description


def _job_url(host: str, locale: str, seq: str) -> str:
    if "_" in locale:
        lang, country = locale.split("_", 1)
        if lang and country:
            return f"https://{host}/{country.lower()}/{lang.lower()}/job/{seq}"
    return f"https://{host}/job/{seq}"


def parse_phenom_payload(
    employer_name: str, host: str, payload: Any, details: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    data = (payload.get("refineSearch") or {}).get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict) or not isinstance(data.get("jobs"), list):
        raise ValueError("Invalid Phenom listing")
    jobs = data["jobs"]
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for posting in jobs:
        location = str(posting.get("cityState") or "").strip()
        if not is_explicit_ireland_location(location):
            continue
        seq = str(posting.get("jobSeqNo") or "").strip()
        title = str(posting.get("title") or "").strip()
        if not seq or not title or seq in seen:
            continue
        seen.add(seq)
        description = ""
        detail = (details or {}).get(seq) or {}
        job = ((detail.get("jobDetail") or {}).get("data") or {}).get("job") or {}
        description = clean_html_description(str(job.get("description") or ""))
        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": location,
                "employment_type": "See job post",
                "salary_text": extract_salary_from_context(description, title),
                "description": description or f"{employer_name} position: {title}. Location: {location}.",
                "url": _job_url(host, str(posting.get("locale") or ""), seq),
                "source": employer_name,
            }
        )
    return opportunities
