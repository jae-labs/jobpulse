"""Workday CXS API job detail extractor."""

from __future__ import annotations

import json
import re
from urllib.request import Request

from jobpulse_scraper.engine.description_quality import has_description_body
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_html_description, clean_text
from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen


def extract_workday_cxs_job_spec(url: str, title: str) -> dict[str, str | None]:
    """Fetch structured job details directly via Workday CXS JSON endpoint."""
    try:
        match = re.match(r"https://([^.]+)\.([^/]+)/(?:[a-zA-Z]{2}-[a-zA-Z]{2}/)?([^/]+)/job/(.+)", url)
        if not match:
            return {}
        subdomain, domain, site, rest = match.groups()
        tenant = subdomain.split(".")[0]
        api_url = f"https://{subdomain}.{domain}/wday/cxs/{tenant}/{site}/job/{rest}"
        req = Request(
            api_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json",
            },
        )
        with urlopen(req, timeout=10, context=get_ssl_context()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            info = data.get("jobPostingInfo", {})
            raw_desc = info.get("jobDescription", "")
            clean_desc = (
                clean_html_description(raw_desc) if ("<" in raw_desc and ">" in raw_desc) else clean_text(raw_desc)
            )
            if has_description_body(clean_desc):
                loc = info.get("location", "")
                time_type = info.get("timeType", "Full time")
                sal = extract_salary_from_context(clean_desc, title)
                return {
                    "description": clean_desc.strip(),
                    "location": loc if loc else "Ireland",
                    "employment_type": "Permanent" if "full" in time_type.lower() else time_type[:25],
                    "salary_text": sal,
                }
    except Exception:
        pass
    return {}
