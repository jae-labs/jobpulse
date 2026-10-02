"""Resolve WhatJobs' JavaScript wrapper without executing page scripts."""

from __future__ import annotations

import html
import re
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlparse

from extractors.general import extract_general_job_detail
from network.http_client import fetch_page

_lock = threading.Lock()
_blocked_until = 0.0


def extract_whatjobs_job_spec(url: str, company: str, title: str) -> dict[str, str]:
    global _blocked_until
    with _lock:
        if time.monotonic() < _blocked_until:
            return {"detail_error": "source_blocked"}
    try:
        page = fetch_page(url)
        match = re.search(r'window\.location\.replace\(\s*(["\'])(.*?)\1\s*\)', page, re.DOTALL)
        if not match:
            return extract_general_job_detail(url, company, title)
        target = urljoin(url, html.unescape(match.group(2)))
        parsed = urlparse(target)
        # This provider's constant redirect points to its own canonical posting.
        if parsed.scheme != "https" or parsed.hostname != urlparse(url).hostname or target == url:
            return {}
        # Fetch here so a host-wide access denial can be distinguished from no body.
        detail_page = fetch_page(target)
        return extract_general_job_detail(target, company, title, html_content=detail_page)
    except HTTPError as exc:
        if exc.code in {401, 403, 429}:
            with _lock:
                _blocked_until = time.monotonic() + 300
            return {"detail_error": "source_blocked"}
        return {}
    except Exception:
        return {}
