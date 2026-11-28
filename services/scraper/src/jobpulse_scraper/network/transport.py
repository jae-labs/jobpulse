"""Explicit transports preserve status and bound public response bodies."""

import gzip
import io
import zlib
from urllib.request import Request

from jobpulse_scraper.contracts import FetchRequest, FetchResponse, ResponseBudgetExceeded
from jobpulse_scraper.network.http_client import DEFAULT_USER_AGENT, open_request
from jobpulse_scraper.network.limits import MAX_RESPONSE_BYTES as MAX_RESPONSE_BYTES


def bounded_body(response) -> bytes:
    raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ResponseBudgetExceeded("HTTP response exceeds body budget")
    encoding = response.headers.get("Content-Encoding", "").lower()
    if encoding == "gzip" or raw.startswith(b"\x1f\x8b"):
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as compressed:
            raw = compressed.read(MAX_RESPONSE_BYTES + 1)
    elif encoding == "deflate":
        raw = zlib.decompressobj().decompress(raw, MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ResponseBudgetExceeded("Decompressed response exceeds body budget")
    return raw


class HttpTransport:
    def __init__(self, timeout: int = 12):
        self.timeout = timeout

    def fetch(self, url: str | FetchRequest) -> FetchResponse:
        spec = url if isinstance(url, FetchRequest) else FetchRequest(url)
        request = Request(
            spec.url,
            data=spec.body,
            method=spec.method,
            headers={"User-Agent": DEFAULT_USER_AGENT, "Accept-Encoding": "gzip, deflate", **dict(spec.headers)},
        )
        with open_request(request, timeout=self.timeout) as response:
            return FetchResponse(
                response.geturl(), response.status, bounded_body(response), response.headers.get("Content-Type", "")
            )


class BrowserTransport:
    def fetch(self, url: str | FetchRequest) -> FetchResponse:
        from jobpulse_scraper.network.browser import fetch_browser_response

        if isinstance(url, FetchRequest):
            if url.method != "GET" or url.body:
                raise ValueError("Browser transport requires GET navigation")
            url = url.url
        response = fetch_browser_response(url)
        if len(response.body) > MAX_RESPONSE_BYTES:
            raise ResponseBudgetExceeded("Browser response exceeds body budget")
        return response
