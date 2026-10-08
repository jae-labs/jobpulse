"""Workday compatibility entry point composes the shared bounded adapter."""

from __future__ import annotations

from typing import Any
from urllib.request import Request

from jobpulse_scraper.contracts import FetchRequest, FetchResponse, ResponseBudgetExceeded, SourceTarget
from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen
from jobpulse_scraper.network.legacy_transport import RequestOpener
from jobpulse_scraper.network.limits import MAX_RESPONSE_BYTES
from jobpulse_scraper.scrapers.parsers.workday import parse_workday_payload as parse_workday_payload
from jobpulse_scraper.scrapers.parsers.workday import workday_board_parts


def extract_workday_opportunities(
    employer_name: str, listing_url: str, *, request_opener: RequestOpener | None = None
) -> list[dict[str, Any]]:
    """Use the same facet selection, pagination and identity rules as durable work."""
    from jobpulse_scraper.scrapers.adapters import ADAPTERS

    try:
        workday_board_parts(listing_url)
    except ValueError:
        return []

    class Transport:
        def fetch(self, spec: str | FetchRequest, /) -> FetchResponse:
            if not isinstance(spec, FetchRequest):
                raise ValueError("Workday requires a typed POST request")
            request = Request(
                spec.url,
                data=spec.body,
                method=spec.method,
                headers={"User-Agent": "Mozilla/5.0", **dict(spec.headers)},
            )
            with (request_opener or urlopen)(request, timeout=10, context=get_ssl_context()) as response:
                body = response.read()
                if len(body) > MAX_RESPONSE_BYTES:
                    raise ResponseBudgetExceeded("Workday response exceeds byte budget")
                return FetchResponse(spec.url, getattr(response, "status", 200), body, "application/json", spec)

    target = SourceTarget("workday", employer_name, listing_url)
    jobs = ADAPTERS["workday"].crawl(target, Transport())
    return [job.as_record() for job in jobs]
