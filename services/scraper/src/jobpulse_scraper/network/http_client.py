"""HTTP fetching with certificate-error fallback and final redirect URL tracking."""

from __future__ import annotations

import http.cookiejar
import ssl
import time
from contextlib import contextmanager
from contextvars import ContextVar
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import HTTPCookieProcessor, HTTPRedirectHandler, HTTPSHandler, Request, build_opener

from jobpulse_scraper.contracts import ResponseBudgetExceeded
from jobpulse_scraper.network.limits import MAX_RESPONSE_BYTES
from jobpulse_scraper.network.request_policy import ContentChallenge, HostCoolingDown, gate, is_challenge_action


class PacedRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        gate.observe(req.full_url, code, headers.get("Retry-After"))
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None:
            gate.wait(redirected.full_url)
        return redirected


_cookies: ContextVar[http.cookiejar.CookieJar | None] = ContextVar("public_cookies", default=None)


def wire_url(url: str) -> str:
    """Encode invalid wire characters without changing catalog identity values."""
    parts = urlsplit(url)
    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            quote(parts.path, safe="/%:@!$&'()*+,;=-._~"),
            quote(parts.query, safe="=&%/:?@!$'()*+,;~-._"),
            "",
        )
    )


def _stdlib_urlopen(request: Request, timeout: int, context: ssl.SSLContext):
    from jobpulse_scraper.network.experience import measured_stage

    handlers = [PacedRedirect(), HTTPSHandler(context=context)]
    jar = _cookies.get()
    if jar is not None:
        handlers.append(HTTPCookieProcessor(jar))
    encoded = Request(
        wire_url(request.full_url), data=request.data, headers=dict(request.header_items()), method=request.get_method()
    )
    with measured_stage("http_open"):
        response = build_opener(*handlers).open(encoded, timeout=timeout)
    return BoundedResponse(response)


class PublicSession:
    """Cookie-based public ATS requests use the same pacing and TLS policy."""

    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()

    @contextmanager
    def open(self, request: Request, timeout: int = 15):
        token = _cookies.set(self.cookies)
        try:
            with open_request(request, timeout=timeout) as response:
                yield response
        finally:
            _cookies.reset(token)


def _response_url(response, fallback: str) -> str:
    url = response.geturl()
    return url if isinstance(url, str) else fallback


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def get_ssl_context() -> ssl.SSLContext:
    """Return a TLS context with certificate and hostname verification enabled."""
    return ssl.create_default_context()


def _observe_http_response(response, url: str) -> None:
    final_url = _response_url(response, url)
    blocked = is_challenge_action(response.headers.get("x-amzn-waf-action"))
    if blocked:
        gate.observe(final_url, response.status, response.headers.get("Retry-After"), content_blocked=True)
        response.close()
        raise ContentChallenge(final_url, response.status)
    gate.observe(final_url, response.status, response.headers.get("Retry-After"))


def _observe_http_error(error: HTTPError) -> None:
    if is_challenge_action(error.headers.get("x-amzn-waf-action")):
        gate.observe(error.url, error.code, error.headers.get("Retry-After"), content_blocked=True)
        error.close()
        raise ContentChallenge(error.url, error.code) from error
    gate.observe(error.url, error.code, error.headers.get("Retry-After"))


def _urlopen_with_tls_fallback(request: Request, timeout: int, context: ssl.SSLContext):
    gate.wait(request.full_url)
    try:
        response = _stdlib_urlopen(request, timeout=timeout, context=context)
        _observe_http_response(response, request.full_url)
        return response
    except HTTPError as exc:
        _observe_http_error(exc)
        raise
    except (URLError, ssl.SSLCertVerificationError) as exc:
        reason = exc.reason if isinstance(exc, URLError) else exc
        if not isinstance(reason, ssl.SSLCertVerificationError):
            raise
        fallback = get_ssl_context()
        fallback.check_hostname = False
        fallback.verify_mode = ssl.CERT_NONE
        gate.wait(request.full_url)
        try:
            response = _stdlib_urlopen(request, timeout=timeout, context=fallback)
            _observe_http_response(response, request.full_url)
            return response
        except HTTPError as error:
            _observe_http_error(error)
            raise


@contextmanager
def open_request(request: Request, timeout: int = 12, context: ssl.SSLContext | None = None):
    """Pace public requests; retry transient errors while respecting host cooldowns."""
    ssl_context = context or get_ssl_context()
    delays = (1.5, 3.0)
    response = None
    for attempt in range(len(delays) + 1):
        try:
            response = _urlopen_with_tls_fallback(request, timeout=timeout, context=ssl_context)
            break
        except HTTPError as exc:
            if isinstance(exc, HostCoolingDown) or exc.code in (401, 403, 429) or exc.headers.get("Retry-After"):
                raise
            if exc.code < 500 or attempt == len(delays):
                raise
            time.sleep(delays[attempt])
    if response is None:
        raise RuntimeError("HTTP request returned no response")
    try:
        yield response
    finally:
        response.close()


class BoundedResponse:
    """Legacy streaming callers share the fixed public wire-byte ceiling."""

    def __init__(self, response):
        self.response = response
        self.received = 0

    def __getattr__(self, name):
        return getattr(self.response, name)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.response.close()

    def read(self, size: int = -1) -> bytes:
        from jobpulse_scraper.network.experience import measured_stage

        remaining = MAX_RESPONSE_BYTES - self.received
        requested = remaining + 1 if size < 0 else min(size, remaining + 1)
        with measured_stage("http_body_read"):
            chunk = self.response.read(requested)
        self.received += len(chunk)
        if self.received > MAX_RESPONSE_BYTES:
            raise ResponseBudgetExceeded("HTTP response exceeds cumulative wire budget")
        return chunk


def _read_and_decompress(resp) -> str:
    from jobpulse_scraper.network.transport import bounded_body

    return bounded_body(resp).decode("utf-8", errors="replace")


def fetch_url_with_final(url: str, timeout: int = 12) -> tuple[str, str]:
    """Fetch URL and return (final_effective_url, response_text)."""
    headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IE,en-GB;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }
    req = Request(url, headers=headers)
    ssl_context = get_ssl_context()
    try:
        with _urlopen_with_tls_fallback(req, timeout=timeout, context=ssl_context) as resp:
            return resp.geturl(), _read_and_decompress(resp)
    except HTTPError as e:
        if isinstance(e, HostCoolingDown) or e.code in (401, 403, 429) or e.headers.get("Retry-After"):
            raise
        if e.code >= 500:
            # Denials are already surfaced above; only transient server errors retry.
            delays = (1.5, 3.0)
            for delay in delays:
                time.sleep(delay)
                try:
                    with _urlopen_with_tls_fallback(req, timeout=timeout, context=ssl_context) as resp:
                        return resp.geturl(), _read_and_decompress(resp)
                except HTTPError as retry_err:
                    if retry_err.code < 500 or retry_err.headers.get("Retry-After"):
                        raise
            raise
        raise


def fetch_page(url: str) -> str:
    """Convenience helper returning the page content string."""
    _, content = fetch_url_with_final(url)
    return content
