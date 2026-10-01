"""Scraper event logging and exception formatting."""

from __future__ import annotations

import threading
from datetime import datetime
from urllib.error import HTTPError, URLError

_log_lock = threading.Lock()


def format_error_message(exc: Exception) -> str:
    """Format exceptions into concise, human-readable error descriptions."""
    if isinstance(exc, HTTPError):
        return f"HTTP {exc.code} {exc.reason}"
    if isinstance(exc, URLError):
        reason = str(exc.reason)
        if "timed out" in reason.lower():
            return "Connection timed out"
        if "nodename nor servname" in reason.lower() or "name resolution" in reason.lower():
            return "DNS resolution failed (domain not reachable)"
        if "certificate" in reason.lower() or "ssl" in reason.lower():
            return f"SSL error: {reason}"
        return f"Connection error: {reason}"
    if isinstance(exc, TimeoutError):
        return "Connection timed out"
    msg = str(exc).strip()
    if "\n" in msg:
        msg = msg.split("\n")[0].strip()
    return f"{type(exc).__name__}: {msg}" if msg else type(exc).__name__


def log_scraper_event(
    status_type: str,
    name: str,
    message: str,
    url: str | None = None,
    method: str = "HTTP",
) -> None:
    """Print real-time scraper progress without emojis, including method (HTTP vs Playwright)."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    badges = {
        "QUERYING": "[QUERY]",
        "SUCCESS": "[FOUND]",
        "ZERO": "[NONE] ",
        "EMPTY": "[EMPTY]",
        "UNSUPPORTED": "[UNSUPPORTED]",
        "BLOCKED": "[BLOCKED]",
        "ERROR": "[ERROR]",
        "PHASE": "[PHASE]",
        "INFO": "[INFO] ",
        "AUTH_WALL": "[AUTH] ",
    }
    badge = badges.get(status_type, f"[{status_type}]")

    url_part = f" -> {url}" if url else ""
    if status_type == "PHASE":
        line = f"[{timestamp}] {badge} {name}: {message}"
    else:
        line = f"[{timestamp}] {badge} [{method:<10}] {name}: {message}{url_part}"

    with _log_lock:
        print(line, flush=True)
