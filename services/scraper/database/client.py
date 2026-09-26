"""Supabase client initialization and datetime utilities."""

from __future__ import annotations

import os
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import TypeVar

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

# Ensure .env is loaded from scraper directory or repository root
BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent.parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(REPO_ROOT / ".env")

_supabase_client: Client | None = None
_client_lock = threading.Lock()


def utc_now() -> str:
    """Return current UTC timestamp in ISO 8601 string format without microseconds."""
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def get_supabase() -> Client:
    """Get or initialize singleton Supabase client using service role key."""
    global _supabase_client
    with _client_lock:
        if _supabase_client is None:
            supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
            supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

            if not supabase_url or not supabase_key:
                raise RuntimeError(
                    "Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env"
                )

            limits = httpx.Limits(max_keepalive_connections=20, max_connections=50)
            http_client = httpx.Client(limits=limits)
            options = SyncClientOptions(postgrest_client_timeout=20, httpx_client=http_client)
            try:
                _supabase_client = create_client(supabase_url, supabase_key, options=options)
            except Exception:
                http_client.close()
                raise
        return _supabase_client


T = TypeVar("T")

_TRANSIENT_ERROR_MARKERS = (
    "connectionterminated",
    "connection reset",
    "connection aborted",
    "errno 35",
    "resource temporarily unavailable",
    "timed out",
    "remoteprotocolerror",
    "broken pipe",
)


def retry_supabase(fn: Callable[[], T], attempts: int = 3, base_delay: float = 0.4) -> T:
    """Retry a Supabase call with short backoff on transient connection errors."""
    last_exc: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if not any(marker in str(exc).lower() for marker in _TRANSIENT_ERROR_MARKERS) or i == attempts - 1:
                raise
            time.sleep(base_delay * (2**i))
    raise last_exc  # type: ignore[misc]
