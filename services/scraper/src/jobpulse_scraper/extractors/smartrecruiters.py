"""Fetch role sections from the SmartRecruiters posting detail API."""

from __future__ import annotations

import json
import re
from urllib.request import Request

from jobpulse_scraper.engine.text_cleaner import clean_html_description
from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen


def extract_smartrecruiters_job_spec(url: str) -> dict[str, str]:
    match = re.match(r"https://jobs\.smartrecruiters\.com/([^/]+)/(\d+)", url)
    if not match:
        return {}
    company, posting = match.groups()
    request = Request(
        f"https://api.smartrecruiters.com/v1/companies/{company}/postings/{posting}",
        headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    try:
        with urlopen(request, timeout=10, context=get_ssl_context()) as response:
            data = json.loads(response.read())
        sections = data.get("jobAd", {}).get("sections", {})
        parts = [
            sections.get(key, {}).get("text", "")
            for key in ("jobDescription", "qualifications", "additionalInformation")
        ]
        description = clean_html_description("\n".join(parts))
        if not description:
            description = clean_html_description(sections.get("companyDescription", {}).get("text", ""))
        return {"description": description}
    except Exception:
        return {}
