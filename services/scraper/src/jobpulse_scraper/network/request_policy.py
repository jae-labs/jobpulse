"""Host pacing and durable denial cooldowns for public crawl traffic."""

from __future__ import annotations

import json
import math
import threading
import time as time
from datetime import UTC
from email.message import Message
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit

import yaml

from jobpulse_scraper.network.ledger import RequestLedger
from jobpulse_scraper.paths import PACKAGE_ROOT, STATE_ROOT

ROOT = PACKAGE_ROOT
POLICY_PATH = ROOT / "config" / "request_policy.yaml"
STATE_PATH = STATE_ROOT.parent / "http-cooldowns.json"


def load_policy(path: Path = POLICY_PATH) -> dict:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("defaults"), dict):
        raise ValueError("Request policy requires defaults and hosts mappings")
    if not isinstance(data.get("hosts"), dict):
        raise ValueError("Request policy hosts must be a mapping")
    for settings in [data["defaults"], *data["hosts"].values()]:
        if not isinstance(settings, dict):
            raise ValueError("Host policy must be a mapping")
        for key in ("min_interval_seconds", "block_cooldown_seconds"):
            value = settings.get(key, data["defaults"].get(key))
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 1:
                raise ValueError(f"{key} must be finite and at least one second")
    return data


def retry_after_seconds(value: str | None, now: float | None = None) -> float:
    """Support HTTP delta-seconds and dates; malformed values use policy fallback."""
    if not value:
        return 0
    try:
        if value.strip().isascii() and value.strip().isdigit():
            seconds = float(value.strip())
        else:
            date = parsedate_to_datetime(value)
            if date.tzinfo is None:
                date = date.replace(tzinfo=UTC)
            seconds = date.timestamp() - (time.time() if now is None else now)
        return max(0, seconds) if math.isfinite(seconds) else 0
    except (ValueError, TypeError, OverflowError):
        return 0


class HostCoolingDown(HTTPError):
    """A local denial; no request was sent to the remote server."""

    def __init__(self, url: str, until: float):
        headers = Message()
        headers["Retry-After"] = str(max(1, math.ceil(until - time.time())))
        super().__init__(url, 429, "Host is cooling down locally", headers, None)


class RequestGate:
    def __init__(self):
        self.lock = threading.RLock()
        self.last_started: dict[str, float] = {}

    def settings(self, url: str) -> dict:
        policy = load_policy()
        return {**policy["defaults"], **policy["hosts"].get(urlsplit(url).netloc.lower(), {})}

    def _state(self) -> dict[str, float]:
        if not STATE_PATH.exists():
            return {}
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or any(
            not isinstance(v, (int, float)) or not math.isfinite(v) for v in data.values()
        ):
            raise ValueError("Invalid HTTP cooldown state; review before crawling")
        return data

    def check(self, url: str) -> None:
        host = urlsplit(url).netloc.lower()
        until = max(self._state().get(host, 0), RequestLedger(STATE_PATH.with_suffix(".sqlite3")).cooldown(host))
        if until > time.time():
            raise HostCoolingDown(url, until)

    def wait(self, url: str) -> None:
        self.check(url)
        host = urlsplit(url).netloc.lower()
        interval = self.settings(url)["min_interval_seconds"]
        delay, cooldown = RequestLedger(STATE_PATH.with_suffix(".sqlite3")).reserve(host, time.time(), interval)
        if cooldown:
            raise HostCoolingDown(url, cooldown)
        if delay:
            time.sleep(delay)
        self.check(url)

    def observe(self, url: str, status: int, retry_after: str | None) -> None:
        if not isinstance(status, int) or not 100 <= status <= 599:
            return
        retry_after = retry_after if isinstance(retry_after, str) else None
        denied = status in (401, 403, 429) or bool(retry_after)
        settings = self.settings(url)
        now = time.time()
        retry_seconds = retry_after_seconds(retry_after)
        cooldown = now + max(settings["block_cooldown_seconds"], retry_seconds) if denied else 0
        host = urlsplit(url).netloc.lower()
        RequestLedger(STATE_PATH.with_suffix(".sqlite3")).observe(
            host,
            now,
            status,
            retry_seconds,
            cooldown,
            settings["min_interval_seconds"],
        )
        if not denied:
            return
        # The JSON export preserves the established cooldown inspection command.
        # SQLite is authoritative across processes; the export is diagnostic only.
        with self.lock:
            state = self._state()
            state = {key: value for key, value in state.items() if value > now}
            state[host] = max(state.get(host, 0), cooldown)
            STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            import os
            import tempfile

            descriptor, temporary = tempfile.mkstemp(dir=STATE_PATH.parent)
            try:
                with os.fdopen(descriptor, "w") as output:
                    output.write(json.dumps(state, indent=2) + "\n")
                os.replace(temporary, STATE_PATH)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)


gate = RequestGate()
