"""Amazon Jobs JSON API adapter (Amazon Ireland, AWS)."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.amazon import parse_amazon_payload as parse_amazon_payload


def extract_amazon_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from Amazon Jobs API."""
    opportunities: list[dict[str, Any]] = []

    if "amazon.jobs" not in listing_url:
        return opportunities

    if "/search.json" in listing_url:
        api_url = listing_url
        if "result_limit=" not in api_url:
            api_url += ("&" if "?" in api_url else "?") + "result_limit=100"
    elif "business_category" in listing_url or "aws" in employer_name.lower():
        api_url = "https://www.amazon.jobs/en/search.json?business_category[]=amazon-web-services&country=IRL&result_limit=100"
    else:
        api_url = "https://www.amazon.jobs/en/search.json?country=IRL&result_limit=100"

    amz_req = Request(api_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with (request_opener or urlopen)(amz_req, timeout=10, context=get_ssl_context()) as r:
        amz_data = json.loads(r.read().decode())
        return parse_amazon_payload(employer_name, listing_url, amz_data)
    return opportunities
