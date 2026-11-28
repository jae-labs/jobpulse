"""Rezoomo careers-board listing adapter."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.rezoomo import parse_rezoomo_payload as parse_rezoomo_payload
from jobpulse_scraper.scrapers.parsers.rezoomo import rezoomo_company_slug


def extract_rezoomo_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Rezoomo company job boards."""
    opportunities: list[dict[str, Any]] = []

    company_slug = rezoomo_company_slug(listing_url)
    if not company_slug:
        return opportunities
    boundary = "----JobPulseRezoomoBoundary"
    post_body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="action"\r\n\r\n'
        f"api.front.company.onMount\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="companyUrl"\r\n\r\n'
        f"{company_slug}\r\n"
        f"--{boundary}--\r\n"
    ).encode()
    rz_req = Request(
        "https://www.rezoomo.com/index.cfm",
        data=post_body,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with (request_opener or urlopen)(rz_req, timeout=10, context=get_ssl_context()) as r:
        res = json.loads(r.read().decode())
        return parse_rezoomo_payload(employer_name, company_slug, res)
    return opportunities
