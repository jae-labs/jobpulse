"""Pure rezoomo vacancy parsing from supplied public source facts."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit

from jobpulse_scraper.engine.location import is_ireland_location
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_text


def rezoomo_company_slug(url: str) -> str | None:
    """Get a published Rezoomo company slug from its company page or tenant host."""
    try:
        parts = urlsplit(url)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
            return None
        path = re.search(r"/company/([A-Za-z0-9_-]+)(?:/|$)", parts.path, re.I)
        if path and parts.hostname.lower() in {"rezoomo.com", "www.rezoomo.com"}:
            return path.group(1)
        host = parts.hostname.lower()
        tenant = re.fullmatch(r"([a-z0-9-]+)\.rezoomo\.com", host)
        if tenant and tenant.group(1) != "www":
            return tenant.group(1)
    except ValueError:
        return None
    return None


def parse_rezoomo_payload(employer_name: str, identifier: str, payload: object) -> list[dict[str, Any]]:
    """Parse supplied source facts without transport or persistence."""
    res: Any = payload
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    if (
        not isinstance(res, dict)
        or not isinstance(res.get("data"), dict)
        or not isinstance(res["data"].get("companyJobs"), list)
    ):
        raise ValueError("Invalid Rezoomo listing")
    for j in res.get("data", {}).get("companyJobs", []):
        title = str(j.get("name") or "").strip()
        if j.get("isPublished") is False:
            continue
        kinds = j.get("type")
        employment = (
            ", ".join(
                {"fulltime": "Full-Time", "perm": "Permanent", "contract": "Contract"}.get(str(kind), str(kind))
                for kind in kinds
            )
            if isinstance(kinds, list)
            else str(kinds or "See job post")
        )
        job_id = j.get("id")
        loc = str(j.get("location") or "").strip()
        if not loc or not is_ireland_location(loc):
            continue
        job_url = f"https://www.rezoomo.com/job/{job_id}/"
        s_from = j.get("salaryFrom")
        s_to = j.get("salaryTo")
        salary = f"€{s_from} – €{s_to}" if s_from and s_to else (f"€{s_from}" if s_from else None)
        desc = j.get("description") or ""
        if not salary:
            salary = extract_salary_from_context(desc, title)
        if title and job_url not in seen_urls:
            seen_urls.add(job_url)
            opportunities.append(
                {
                    "title": title,
                    "company": employer_name,
                    "location": loc,
                    "employment_type": employment,
                    "external_id": str(job_id),
                    "salary_text": salary,
                    "description": clean_text(desc),
                    "url": job_url,
                    "source": employer_name,
                }
            )

    return opportunities
