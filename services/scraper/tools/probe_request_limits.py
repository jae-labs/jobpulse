"""Bounded, paced source observations; never search for a blocking threshold."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import yaml  # noqa: E402

from jobpulse_scraper.config.loader import load_websites_config  # noqa: E402
from jobpulse_scraper.network.request_policy import POLICY_PATH, gate, load_policy  # noqa: E402

USER_AGENT = "JobPulseSourceAudit/1.0"
HEADER_NAMES = (
    "retry-after",
    "ratelimit",
    "ratelimit-policy",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_once(url: str) -> tuple[int, dict[str, str], str]:
    """Exactly one verified-TLS GET, bounded body, no retries or redirects."""
    opener = build_opener(NoRedirect())
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    gate.wait(url)
    try:
        response = opener.open(request, timeout=12)
    except HTTPError as exc:
        response = exc
    with response:
        headers = {key.lower(): value for key, value in response.headers.items() if key.lower() in HEADER_NAMES}
        status = response.code
        gate.observe(url, status, headers.get("retry-after"))
        return status, headers, response.read(262144).decode("utf-8", errors="replace")


def probe(url: str, samples: int = 3, interval: float = 5) -> dict:
    host = urlsplit(url).netloc.lower()
    observation: dict[str, Any] = {
        "observed_at": datetime.now(UTC).isoformat(),
        "url": url,
        "host": host,
        "user_agent": USER_AGENT,
        "requested_samples": samples,
        "successful_samples": 0,
        "interval_seconds": interval,
        "blocking_threshold": None,
        "responses": [],
    }
    responses = observation["responses"]
    try:
        robots_url = f"{urlsplit(url).scheme}://{host}/robots.txt"
        status, headers, body = request_once(robots_url)
        responses.append({"kind": "robots", "status": status, "headers": headers})
        if status != 200 and status != 404:
            observation["outcome"] = "robots_unavailable"
            return observation
        robots = RobotFileParser()
        robots.parse(body.splitlines() if status == 200 else [])
        if status == 200 and not robots.can_fetch(USER_AGENT, url):
            observation["outcome"] = "robots_disallowed"
            return observation
        delay = float(robots.crawl_delay(USER_AGENT) or 0)
        rate = robots.request_rate(USER_AGENT)
        observation["robots_policy"] = {
            "crawl_delay_seconds": delay,
            "request_rate": {"requests": rate.requests, "seconds": rate.seconds} if rate else None,
        }
        if rate and rate.requests <= 0:
            observation["outcome"] = "robots_rate_invalid"
            return observation
        interval = max(
            interval, delay, rate.seconds / rate.requests if rate else 0, gate.settings(url)["min_interval_seconds"]
        )
        observation["interval_seconds"] = interval
        if interval > 60:
            observation["outcome"] = "required_delay_exceeds_probe_budget"
            return observation
        for _ in range(samples):
            time.sleep(interval)
            status, headers, body = request_once(url)
            responses.append({"kind": "sample", "status": status, "headers": headers})
            if status in (401, 403, 429):
                observation["outcome"] = "denied_or_throttled"
                break
            if not 200 <= status < 300 or headers.get("retry-after"):
                observation["outcome"] = "http_stop"
                break
            if any(
                marker in body.lower()
                for marker in (
                    "cf-chl-",
                    "challenge-platform",
                    "verify you are human",
                    "captcha",
                    "access denied",
                )
            ):
                observation["outcome"] = "possible_challenge"
                # Preserve a cooldown even when the access wall returned HTTP 200.
                gate.observe(url, 403, None)
                break
            observation["successful_samples"] += 1
        else:
            observation["outcome"] = "sample_accepted_limit_unknown"
    except (URLError, TimeoutError, OSError) as exc:
        observation["outcome"] = "transport_or_cooldown_stop"
        observation["error_type"] = type(exc).__name__
    return observation


def select_sources(name: str | None, limit: int) -> list[dict]:
    selected = []
    hosts = set()
    for site in load_websites_config():
        if not site["enabled"] or (name and site["name"].casefold() != name.casefold()):
            continue
        host = urlsplit(site["careers_url"]).netloc.lower()
        if host not in hosts:
            selected.append(site)
            hosts.add(host)
        if len(selected) == limit:
            break
    return selected


def save_observations(observations: list[dict], path: Path = POLICY_PATH) -> None:
    policy = load_policy(path)
    for observation in observations:
        settings = policy["hosts"].setdefault(observation["host"], {})
        settings["last_observation"] = observation
        # Accepted samples never justify raising the rate; robots may only slow it.
        settings["min_interval_seconds"] = max(
            settings.get("min_interval_seconds", policy["defaults"]["min_interval_seconds"]),
            observation["interval_seconds"],
        )
    temporary = path.with_suffix(".tmp")
    temporary.write_text(yaml.safe_dump(policy, sort_keys=False), encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", help="Exact enabled employer name from websites.yaml")
    parser.add_argument("--limit", type=int, default=5, help="Unique hosts, at most 10 per invocation")
    parser.add_argument("--samples", type=int, default=3, help="Career URL requests per host, at most 5")
    parser.add_argument("--interval", type=float, default=5, help="Seconds between requests, minimum 5")
    parser.add_argument("--run", action="store_true", help="Send the bounded requests; default lists targets only")
    parser.add_argument("--apply", action="store_true", help="Save observations and slower pacing beside sources")
    parser.add_argument("--report", type=Path, default=Path("../../.backups/request-limits.json"))
    args = parser.parse_args()
    if not 1 <= args.limit <= 10 or not 1 <= args.samples <= 5:
        parser.error("--limit must be 1..10 and --samples 1..5")
    if not math.isfinite(args.interval) or args.interval < 5:
        parser.error("--interval must be finite and at least 5 seconds")
    if args.apply and not args.run:
        parser.error("--apply requires --run")
    sources = select_sources(args.name, args.limit)
    if not sources:
        parser.error("No enabled sources matched")
    if not args.run:
        print(json.dumps([{"name": site["name"], "url": site["careers_url"]} for site in sources], indent=2))
        return
    observations = []
    for site in sources:
        observation = probe(site["careers_url"], args.samples, args.interval)
        observation["name"] = site["name"]
        observations.append(observation)
        # Save each result so an interrupted audit retains completed evidence.
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(observations, indent=2) + "\n", encoding="utf-8")
        if args.apply:
            save_observations([observation])
        print(f"{site['name']}: {observation['outcome']} ({observation['successful_samples']} accepted)", flush=True)


if __name__ == "__main__":
    main()
