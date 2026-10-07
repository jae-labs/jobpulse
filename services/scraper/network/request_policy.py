"""Host pacing and durable denial cooldowns for public crawl traffic."""

from __future__ import annotations

import json
import math
import threading
import time
from datetime import UTC, datetime
from email.message import Message
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit

import yaml

ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = ROOT / "config" / "request_policy.yaml"
STATE_PATH = ROOT.parents[1] / ".backups" / "http-cooldowns.json"


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
        until = self._state().get(urlsplit(url).netloc.lower(), 0)
        if until > time.time():
            raise HostCoolingDown(url, until)

    def wait(self, url: str) -> None:
        with self.lock:
            self.check(url)
            host = urlsplit(url).netloc.lower()
            interval = self.settings(url)["min_interval_seconds"]
            previous = self.last_started.get(host)
            if previous is not None:
                time.sleep(max(0, previous + interval - time.monotonic()))
            self.check(url)
            self.last_started[host] = time.monotonic()

    def observe(self, url: str, status: int, retry_after: str | None) -> None:
        retry_after = retry_after if isinstance(retry_after, str) else None
        if status not in (401, 403, 429, 503) and not retry_after:
            return
        # A 503 without Retry-After remains eligible for normal transient retries.
        if status == 503 and not retry_after:
            return
        with self.lock:
            state = self._state()
            host = urlsplit(url).netloc.lower()
            cooldown = max(self.settings(url)["block_cooldown_seconds"], retry_after_seconds(retry_after))
            now = datetime.now(UTC).timestamp()
            state = {key: value for key, value in state.items() if value > now}
            state[host] = max(state.get(host, 0), now + cooldown)
            STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            temporary = STATE_PATH.with_suffix(".tmp")
            temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
            temporary.replace(STATE_PATH)


gate = RequestGate()
