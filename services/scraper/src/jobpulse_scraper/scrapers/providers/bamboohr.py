"""BambooHR careers list API adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.bamboohr import parse_bamboohr_payload as parse_bamboohr_payload


def extract_bamboohr_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from BambooHR portals."""
    opportunities: list[dict[str, Any]] = []

    bb = re.search(r"https://([a-zA-Z0-9-]+)\.bamboohr\.com", listing_url)
    if not bb:
        return opportunities

    subdomain = bb.group(1)
    bb_req = Request(
        f"https://{subdomain}.bamboohr.com/careers/list",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    with (request_opener or urlopen)(bb_req, timeout=10, context=get_ssl_context()) as r:
        data = json.loads(r.read().decode())
        return parse_bamboohr_payload(employer_name, subdomain, data)

    return opportunities
