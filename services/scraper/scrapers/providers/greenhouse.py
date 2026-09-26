"""Greenhouse job-boards API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location


def extract_greenhouse_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from Greenhouse boards."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    m_gh = re.search(
        r"(?:job-boards|boards)(?:-api)?\.greenhouse\.io/(?:embed/job_board\?for=|v1/boards/)?([a-zA-Z0-9_-]+)",
        listing_url,
    )
    if not m_gh and html_content:
        m_gh = re.search(
            r"(?:job-boards|boards)\.greenhouse\.io/(?:embed/job_board\?for=)?([a-zA-Z0-9_-]+)", html_content
        )
    if not m_gh:
        return opportunities

    gh_token = m_gh.group(1)
    try:
        gh_url = f"https://boards-api.greenhouse.io/v1/boards/{gh_token}/jobs?content=true"
        gh_req = Request(gh_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urlopen(gh_req, timeout=10, context=get_ssl_context()) as r:
            gh_data = json.loads(r.read().decode())
            for j in gh_data.get("jobs", []):
                title = j.get("title", "").strip()
                loc_info = j.get("location", {})
                loc = (loc_info.get("name") if isinstance(loc_info, dict) else str(loc_info)) or ""
                if not is_explicit_ireland_location(loc):
                    continue
                job_url = j.get("absolute_url") or f"https://job-boards.greenhouse.io/{gh_token}/jobs/{j.get('id')}"
                content = clean_text(j.get("content", ""))
                desc = f"{employer_name} position: {title}. Location: {loc}. {content[:300]}".strip()
                salary = extract_salary_from_context(content or desc, title)
                if title and job_url not in seen_urls:
                    seen_urls.add(job_url)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": "See job post",
                            "salary_text": salary,
                            "description": desc,
                            "url": job_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
