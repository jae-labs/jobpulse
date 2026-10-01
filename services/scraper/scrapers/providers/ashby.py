"""AshbyHQ job board API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location


def extract_ashby_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from AshbyHQ job boards."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    m_ash = re.search(r"(?:jobs|api)\.ashbyhq\.com/(?:posting-api/job-board/)?([a-zA-Z0-9_.-]+)", listing_url)
    if not m_ash and html_content:
        m_ash = re.search(r"jobs\.ashbyhq\.com/([a-zA-Z0-9_.-]+)", html_content)
    if not m_ash:
        return opportunities

    ash_token = m_ash.group(1)
    try:
        ash_url = f"https://api.ashbyhq.com/posting-api/job-board/{ash_token}"
        ash_req = Request(ash_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urlopen(ash_req, timeout=10, context=get_ssl_context()) as r:
            ash_data = json.loads(r.read().decode())
            for j in ash_data.get("jobs", []):
                title = j.get("title", "").strip()
                loc = (j.get("location") or "").strip()
                sec_list = [s for s in j.get("secondaryLocations", []) if isinstance(s, dict)]

                # Multi-location check: check primary and secondary locations
                matched_loc = None
                if is_explicit_ireland_location(loc):
                    matched_loc = loc
                else:
                    for s in sec_list:
                        s_loc = s.get("location", "")
                        s_cntry = ""
                        addr = s.get("address")
                        if isinstance(addr, dict):
                            s_cntry = addr.get("addressCountry", "")
                        if is_explicit_ireland_location(s_loc) or s_cntry.strip().lower() in {"ireland", "ie", "irl"}:
                            matched_loc = s_loc or s_cntry
                            break

                if not matched_loc:
                    continue
                loc = matched_loc

                job_url = j.get("jobUrl") or j.get("applyUrl")
                desc_plain = j.get("descriptionPlain") or ""
                desc = f"{employer_name} position: {title}. Location: {loc}. {desc_plain[:300]}".strip()
                salary = extract_salary_from_context(desc_plain or desc, title)
                if title and job_url and job_url not in seen_urls:
                    seen_urls.add(job_url)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": j.get("employmentType") or "See job post",
                            "salary_text": salary,
                            "description": desc,
                            "url": job_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
