"""Workable public widget API adapter.

The paginated v3 accounts endpoint only returns the first page of roughly ten
postings and omits bodies, so most vacancies were silently missed. The v1 widget
endpoint returns the whole board and, with ``details=true``, each posting's
published HTML body.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.scrapers.parsers.workable import parse_workable_payload as parse_workable_payload

_ACCOUNT = re.compile(r"apply\.workable\.com/(?:[a-zA-Z-]+/)?([a-zA-Z0-9_-]+)")


def extract_workable_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Extract every Irish vacancy, with its published body, from a Workable board."""
    opportunities: list[dict[str, Any]] = []

    account_match = _ACCOUNT.search(listing_url)
    if not account_match or "api" in listing_url:
        return opportunities

    account = account_match.group(1)
    request = Request(
        f"https://apply.workable.com/api/v1/widget/accounts/{account}?details=true",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with (request_opener or urlopen)(request, timeout=20, context=get_ssl_context()) as response:
        data = json.loads(response.read().decode())
    return parse_workable_payload(employer_name, account, data)

    return opportunities
