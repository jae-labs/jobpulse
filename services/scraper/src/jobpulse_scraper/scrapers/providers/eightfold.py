"""Eightfold AI job board adapter for ``/api/pcsx/search`` and ``/api/apply/v2/jobs``."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.eightfold import _irish_location
from jobpulse_scraper.scrapers.parsers.eightfold import parse_eightfold_positions as parse_eightfold_positions

_PAGE = 50
_MAX_PAGES = 20
_MAX_DETAILS = 60


def _host_and_domain(listing_url: str) -> tuple[str, str]:
    """Resolve (host, tenant domain). The domain comes from ``?domain=`` or ``*.eightfold.ai``."""
    host_match = re.search(r"https?://([^/?#]+)", listing_url)
    host = host_match.group(1).lower() if host_match else ""
    query = re.search(r"[?&]domain=([^&]+)", listing_url)
    if query:
        return host, query.group(1)
    eightfold = re.match(r"([a-z0-9-]+)\.eightfold\.ai$", host)
    if eightfold:
        return host, f"{eightfold.group(1)}.com"
    return host, host


def _get_json(url: str, *, request_opener: RequestOpener | None = None) -> dict[str, Any] | None:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with (request_opener or urlopen)(request, timeout=15, context=get_ssl_context()) as response:
        payload = json.loads(response.read().decode())
    if not isinstance(payload, dict):
        raise ValueError("Invalid Eightfold response")
    return payload


def _list_positions(
    host: str, domain: str, generation: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    positions: list[dict[str, Any]] = []
    start = 0
    for _ in range(_MAX_PAGES):
        if generation == "pcsx":
            url = f"https://{host}/api/pcsx/search?domain={domain}&query=&start={start}&num={_PAGE}&sort_by=relevance"
        else:
            url = f"https://{host}/api/apply/v2/jobs?domain={domain}&query=&start={start}&num={_PAGE}&sort_by=relevance"
        payload = _get_json(url, request_opener=request_opener)
        data = payload.get("data") if generation == "pcsx" and payload else payload
        if not isinstance(data, dict) or not isinstance(data.get("positions"), list):
            raise ValueError("Invalid Eightfold listing")
        page = data["positions"]
        count = data.get("count", 0)
        if not isinstance(count, int) or count < 0 or any(not isinstance(item, dict) for item in page):
            raise ValueError("Invalid Eightfold listing")
        if not page:
            break
        positions.extend(page)
        start += len(page)
        if count and start >= count:
            break
    return positions


def extract_eightfold_opportunities(
    employer_name: str, listing_url: str, html_content: str = "", *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from an Eightfold board."""
    opportunities: list[dict[str, Any]] = []

    host, domain = _host_and_domain(listing_url)
    if not host or not domain or (".eightfold.ai" not in host and "domain=" not in listing_url):
        return opportunities
    try:
        positions = _list_positions(host, domain, "pcsx", request_opener=request_opener)
    except HTTPError as error:
        if error.code != 404:
            raise
        positions = _list_positions(host, domain, "v2", request_opener=request_opener)
    details = {}
    from jobpulse_scraper.runtime.lease import active_lease

    if active_lease.get() is None:
        for position in positions:
            if _irish_location(position) and len(details) < _MAX_DETAILS:
                ident = position.get("id")
                if ident is not None:
                    details[str(ident)] = _get_json(
                        f"https://{host}/api/apply/v2/jobs/{ident}?domain={domain}", request_opener=request_opener
                    )
    return parse_eightfold_positions(employer_name, host, positions, details)
