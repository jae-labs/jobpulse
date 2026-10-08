"""JobTrain /Home/_JobCard API adapter."""

from __future__ import annotations

import urllib.parse
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.jobtrain import parse_jobtrain_html as parse_jobtrain_html


def extract_jobtrain_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from JobTrain career portals."""
    opportunities: list[dict[str, Any]] = []

    if not (
        "/home/_jobcard" in listing_url.lower()
        or "/home/job" in listing_url.lower()
        or "jobtrain" in html_content.lower()
    ):
        return opportunities

    parsed = urllib.parse.urlparse(listing_url)
    jt_url = f"{parsed.scheme}://{parsed.netloc}/Home/_JobCard"
    jt_req = Request(
        jt_url,
        headers={"User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest"},
    )
    with (request_opener or urlopen)(jt_req, timeout=10, context=get_ssl_context()) as r:
        jt_html = r.read().decode("utf-8", errors="replace")
        return parse_jobtrain_html(employer_name, jt_url, jt_html)
    return opportunities
