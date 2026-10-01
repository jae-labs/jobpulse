"""JobTrain /Home/_JobCard API adapter."""

from __future__ import annotations

import re
import urllib.parse
from typing import Any
from urllib.parse import urljoin
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from engine.validators import is_valid_job_title
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen


def extract_jobtrain_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract vacancies from JobTrain career portals."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    if not (
        "/home/_jobcard" in listing_url.lower()
        or "/home/job" in listing_url.lower()
        or "jobtrain" in html_content.lower()
    ):
        return opportunities

    parsed = urllib.parse.urlparse(listing_url)
    jt_url = f"{parsed.scheme}://{parsed.netloc}/Home/_JobCard"
    try:
        jt_req = Request(
            jt_url,
            headers={"User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest"},
        )
        with urlopen(jt_req, timeout=10, context=get_ssl_context()) as r:
            jt_html = r.read().decode("utf-8", errors="replace")
            jt_links = re.findall(
                r"<a\s+[^>]*href=[\"\']([^\'\"]*JobDetail[^\'\"]*)[\"\'][^>]*>(.*?)</a>",
                jt_html,
                re.I | re.DOTALL,
            )
            for h, t in jt_links:
                ct = clean_text(t)
                if not ct or any(skip in ct.lower() for skip in ["more..", "apply", "view"]):
                    continue
                full_url = urljoin(jt_url, h.strip())
                if is_valid_job_title(ct, full_url) and full_url not in seen_urls:
                    seen_urls.add(full_url)
                    desc = f"{employer_name} vacancy: {ct}. Follow portal link for requirements and closing date."
                    opportunities.append(
                        {
                            "title": ct,
                            "company": employer_name,
                            "location": "Dublin, Ireland",
                            "employment_type": "See job post",
                            "salary_text": extract_salary_from_context(desc, ct),
                            "description": desc,
                            "url": full_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
