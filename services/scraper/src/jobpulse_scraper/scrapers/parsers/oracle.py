"""Pure Oracle Candidate Experience listing normalization."""

from typing import Any

from jobpulse_scraper.engine.location import is_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context


def parse_oracle_payload(employer_name: str, host: str, site_number: str, d: Any) -> list[dict[str, Any]]:
    if not isinstance(d, dict) or not isinstance(d.get("items"), list):
        raise ValueError("Invalid Oracle listing")
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    items = d.get("items", [{}])[0].get("requisitionList", [])
    for req_item in items:
        title = req_item.get("Title", "").strip()
        req_id = req_item.get("Id")
        loc = req_item.get("PrimaryLocation") or "Ireland"
        if not is_ireland_location(loc):
            continue
        short_desc = req_item.get("ShortDescriptionStr") or ""
        preview_url = f"https://{host}/hcmUI/CandidateExperience/en/sites/{site_number}/requisitions/preview/{req_id}"
        if title and preview_url not in seen_urls:
            seen_urls.add(preview_url)
            desc = f"{employer_name} position: {title}. Location: {loc}. {short_desc}".strip()
            salary = extract_salary_from_context(desc, title)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": "See job post",
                    "salary_text": salary,
                    "description": desc,
                    "url": preview_url,
                    "source": employer_name,
                }
            )
    return opportunities
