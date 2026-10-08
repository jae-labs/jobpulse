"""Pure Workday CXS listing normalization."""

from typing import Any

from jobpulse_scraper.engine.location import is_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context


def parse_workday_payload(company: str, listing_url: str, payload: Any) -> list[dict[str, Any]]:
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("jobPostings"), list)
        or not isinstance(payload.get("total"), int)
    ):
        raise ValueError("Invalid Workday listing")
    import re
    from urllib.parse import urlsplit

    match = re.search(r"https://([^.]+)\.wd(\d+)\.myworkdayjobs\.com/(?:[a-zA-Z-]+/)?([^/?#]+)", listing_url)
    if not match:
        raise ValueError("Invalid Workday board URL")
    tenant, generation, site = match.groups()
    host = urlsplit(listing_url).netloc
    jobs = {}
    for posting in payload["jobPostings"]:
        title = str(posting.get("title") or "").strip()
        location = posting.get("locationsText") or "Ireland"
        if not is_ireland_location(location):
            continue
        path = posting.get("externalPath")
        if not title or not path:
            continue
        url = f"https://{host}/en-US/{site}{path}"
        description = f"{company} position: {title}. {posting.get('postedOn', '')} Requisition: {', '.join(posting.get('bulletFields', []))}."
        jobs[url] = {
            "title": title,
            "company": company,
            "location": location,
            "employment_type": "See job post",
            "salary_text": extract_salary_from_context(description, title),
            "description": description,
            "description_is_snippet": True,
            "url": url,
            "source": company,
            "external_id": str(path),
        }
    return list(jobs.values())
