"""Pure hubspot vacancy parsing from supplied public source facts."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.engine.location import is_ireland_location


def parse_hubspot_payload(employer_name: str, identifier: str, payload: object) -> list[dict[str, Any]]:
    """Parse supplied source facts without transport or persistence."""
    hb_data: Any = payload
    if isinstance(hb_data, dict) and isinstance(hb_data.get("jobs"), list):
        hb_data = {
            "data": {
                "jobs": [
                    {
                        "id": job.get("id"),
                        "title": job.get("title"),
                        "office": {"location": (job.get("location") or {}).get("name")},
                        "published_description": job.get("content", ""),
                    }
                    for job in hb_data["jobs"]
                ]
            }
        }
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if (
        not isinstance(hb_data, dict)
        or not isinstance(hb_data.get("data"), dict)
        or not isinstance(hb_data["data"].get("jobs"), list)
    ):
        raise ValueError("Invalid HubSpot listing")
    for j in hb_data.get("data", {}).get("jobs", []):
        title = j.get("title", "").strip()
        loc = (j.get("office") or {}).get("location") or (j.get("location") or {}).get("name") or "Dublin, Ireland"
        if not is_ireland_location(loc) or not any(k in loc.lower() for k in ["dublin", "ireland"]):
            continue
        job_id = j.get("id")
        job_url = f"https://www.hubspot.com/careers/jobs/{job_id}"
        dept = (j.get("department") or {}).get("name", "")
        desc = j.get("published_description") or f"HubSpot position: {title}. Location: {loc}. Department: {dept}."
        if title and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": "See job post",
                    "salary_text": None,
                    "description": desc,
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
