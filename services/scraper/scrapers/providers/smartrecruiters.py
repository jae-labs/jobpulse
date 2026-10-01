"""SmartRecruiters postings API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location


def extract_smartrecruiters_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from SmartRecruiters portals."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    m_sr = re.search(r"careers\.smartrecruiters\.com/([a-zA-Z0-9_-]+)", listing_url)
    if not m_sr and html_content:
        m_sr = re.search(r"careers\.smartrecruiters\.com/([a-zA-Z0-9_-]+)", html_content)
    if not m_sr:
        return opportunities

    sr_token = m_sr.group(1)
    try:
        sr_url = f"https://api.smartrecruiters.com/v1/companies/{sr_token}/postings"
        sr_req = Request(sr_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urlopen(sr_req, timeout=10, context=get_ssl_context()) as r:
            sr_data = json.loads(r.read().decode())
            for j in sr_data.get("content", []):
                title = j.get("name", "").strip()
                loc_obj = j.get("location", {}) or {}
                loc = loc_obj.get("city") or loc_obj.get("country") or ""
                if not is_explicit_ireland_location(loc):
                    continue
                job_id = j.get("id")
                job_url = f"https://jobs.smartrecruiters.com/{sr_token}/{job_id}"
                desc = f"{employer_name} position: {title}. Location: {loc}."
                if title and job_url not in seen_urls:
                    seen_urls.add(job_url)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": j.get("typeOfEmployment", {}).get("label") or "See job post",
                            "salary_text": extract_salary_from_context(desc, title),
                            "description": desc,
                            "url": job_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
