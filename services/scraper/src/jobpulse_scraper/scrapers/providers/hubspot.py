"""HubSpot Careers GraphQL API adapter."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.hubspot import parse_hubspot_payload as parse_hubspot_payload


def extract_hubspot_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract vacancies from HubSpot Careers GraphQL API."""
    opportunities: list[dict[str, Any]] = []

    if "hubspot.com" not in listing_url:
        return opportunities

    hb_query = """query Jobs {
      jobs {
        id
        title
        department { name }
        office { id location }
        location { name }
      }
    }"""
    hb_payload = json.dumps({"operationName": "Jobs", "query": hb_query, "variables": {}}).encode("utf-8")
    hb_req = Request(
        "https://wtcfns.hubspot.com/careers/graphql",
        data=hb_payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Origin": "https://www.hubspot.com",
            "Referer": "https://www.hubspot.com/",
        },
    )
    with (request_opener or urlopen)(hb_req, timeout=10, context=get_ssl_context()) as r:
        hb_data = json.loads(r.read().decode())
        return parse_hubspot_payload(employer_name, listing_url, hb_data)
    return opportunities
