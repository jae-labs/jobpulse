"""Read the published JobsIreland body, excluding navigation and listing metadata."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

from engine.text_cleaner import clean_html_description
from network.http_client import fetch_page


def extract_jobsireland_job_spec(url: str) -> dict[str, str]:
    try:
        page = fetch_page(url)
        requested_id = parse_qs(urlparse(url).query).get("id", [""])[0]
        reference = re.search(r'id="JobReference"[^>]*value="\s*#JOB-(\d+)"', page, re.IGNORECASE)
        if reference and reference.group(1) != requested_id:
            return {}
        bodies = re.findall(
            r'<pre\b[^>]*ng-bind-html=["\']Description\s*\|\s*linky["\'][^>]*>(.*?)</pre>',
            page,
            re.IGNORECASE | re.DOTALL,
        )
        return (
            {"description": clean_html_description("\n".join(bodies)), "description_origin": "published_detail"}
            if bodies
            else {}
        )
    except Exception:
        return {}
