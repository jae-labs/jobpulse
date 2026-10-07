"""HTTP fetching with certificate-error fallback and final redirect URL tracking."""

from __future__ import annotations

import ssl
import time
from contextlib import contextmanager
from urllib.error import HTTPError, URLError
from urllib.request import Request
from urllib.request import urlopen as _stdlib_urlopen

from network.request_policy import HostCoolingDown, gate

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def get_ssl_context() -> ssl.SSLContext:
    """Return a TLS context with certificate and hostname verification enabled."""
    return ssl.create_default_context()


def _urlopen_with_tls_fallback(request: Request, timeout: int, context: ssl.SSLContext):
    gate.wait(request.full_url)
    try:
        response = _stdlib_urlopen(request, timeout=timeout, context=context)
        gate.observe(request.full_url, response.status, response.headers.get("Retry-After"))
        return response
    except HTTPError as exc:
        gate.observe(request.full_url, exc.code, exc.headers.get("Retry-After"))
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
            gate.observe(request.full_url, response.status, response.headers.get("Retry-After"))
            return response
        except HTTPError as error:
            gate.observe(request.full_url, error.code, error.headers.get("Retry-After"))
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


def _read_and_decompress(resp) -> str:
    raw = resp.read()
    enc = resp.info().get("Content-Encoding", "").lower()
    if "gzip" in enc or raw[:2] == b"\x1f\x8b":
        import gzip

        try:
            return gzip.decompress(raw).decode("utf-8", errors="replace")
        except Exception:
            pass
    elif "deflate" in enc:
        import zlib

        try:
            return zlib.decompress(raw).decode("utf-8", errors="replace")
        except Exception:
            try:
                return zlib.decompress(raw, -zlib.MAX_WBITS).decode("utf-8", errors="replace")
            except Exception:
                pass
    return raw.decode("utf-8", errors="replace")


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
