"""Robust HTTP fetching with automatic headers, SSL fallback, and final redirect URL tracking."""

from __future__ import annotations

import ssl
import time
from contextlib import contextmanager
from urllib.error import HTTPError
from urllib.request import Request
from urllib.request import urlopen as _stdlib_urlopen

try:
    from curl_cffi import requests as cffi_requests

    HAS_CURL_CFFI = True
except ImportError:
    HAS_CURL_CFFI = False

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def get_ssl_context() -> ssl.SSLContext:
    """Return a TLS context with certificate and hostname verification enabled."""
    return ssl.create_default_context()


@contextmanager
def open_request(request: Request, timeout: int = 12, context: ssl.SSLContext | None = None):
    """Open an HTTP request through the shared verified-TLS retry policy."""
    ssl_context = context or get_ssl_context()
    delays = (1.5, 3.0)
    for attempt in range(len(delays) + 1):
        try:
            response = _stdlib_urlopen(request, timeout=timeout, context=ssl_context)
            try:
                yield response
            finally:
                response.close()
            return
        except HTTPError as exc:
            if exc.code not in (429,) and exc.code < 500 or attempt == len(delays):
                raise
            time.sleep(delays[attempt])


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
    """Fetch URL and return (final_effective_url, response_text). Tries verified SSL first."""
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
        with _stdlib_urlopen(req, timeout=timeout, context=ssl_context) as resp:
            return resp.geturl(), _read_and_decompress(resp)
    except HTTPError as e:
        if e.code in (401, 403) and HAS_CURL_CFFI:
            try:
                r = cffi_requests.get(url, impersonate="chrome124", timeout=timeout)
                if r.status_code == 200 and len(r.text) > 500:
                    return str(r.url), r.text
            except Exception:
                pass
        if e.code in (401, 403):
            # Bot-detection block, not an SSL problem - retrying with a permissive
            # SSL context would not help, so surface it for a browser-based fallback.
            raise
        if e.code >= 500 or e.code == 429:
            # Transient server error or rate-limit - retry a couple of times with
            # backoff before giving up, since these often clear up within seconds.
            delays = (5.0, 10.0) if e.code == 429 else (1.5, 3.0)
            for delay in delays:
                time.sleep(delay)
                try:
                    with _stdlib_urlopen(req, timeout=timeout, context=ssl_context) as resp:
                        return resp.geturl(), _read_and_decompress(resp)
                except HTTPError as retry_err:
                    if retry_err.code < 500 and retry_err.code != 429:
                        raise
            raise
        raise


def fetch_page(url: str) -> str:
    """Convenience helper returning the page content string."""
    _, content = fetch_url_with_final(url)
    return content
