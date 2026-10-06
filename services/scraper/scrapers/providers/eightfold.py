"""Eightfold AI job board adapter (newer ``/api/pcsx/search`` + legacy ``/api/apply/v2/jobs``)."""

from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request

from engine.text_cleaner import clean_html_description
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_explicit_ireland_location

_PAGE = 50
_MAX_PAGES = 20
_MAX_DETAILS = 60


def _host_and_domain(listing_url: str) -> tuple[str, str]:
    """Resolve (host, tenant domain). The domain comes from ``?domain=`` or ``*.eightfold.ai``."""
    host_match = re.search(r"https?://([^/?#]+)", listing_url)
    host = host_match.group(1).lower() if host_match else ""
    query = re.search(r"[?&]domain=([^&]+)", listing_url)
    if query:
        return host, query.group(1)
    eightfold = re.match(r"([a-z0-9-]+)\.eightfold\.ai$", host)
    if eightfold:
        return host, f"{eightfold.group(1)}.com"
    return host, host


def _get_json(url: str) -> dict[str, Any] | None:
    delays = (1.0, 2.0, 4.0)
    for attempt in range(len(delays) + 1):
        try:
            request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
            with urlopen(request, timeout=15, context=get_ssl_context()) as response:
                payload = json.loads(response.read().decode())
                return payload if isinstance(payload, dict) else None
        except HTTPError as exc:
            # 403 is Eightfold's rate-limit signal; retry. Other errors return immediately.
            if exc.code not in (403, 429) and exc.code < 500:
                return None
        except Exception:
            pass
        if attempt == len(delays):
            return None
        time.sleep(delays[attempt])
    return None


def _list_positions(host: str, domain: str, generation: str) -> list[dict[str, Any]]:
    positions: list[dict[str, Any]] = []
    start = 0
    for _ in range(_MAX_PAGES):
        if generation == "pcsx":
            url = f"https://{host}/api/pcsx/search?domain={domain}&query=&start={start}&num={_PAGE}&sort_by=relevance"
        else:
            url = f"https://{host}/api/apply/v2/jobs?domain={domain}&query=&start={start}&num={_PAGE}&sort_by=relevance"
        payload = _get_json(url)
        if not payload:
            return []
        if generation == "pcsx":
            data = payload.get("data") or {}
            page = data.get("positions") or []
            count = data.get("count") or 0
        else:
            page = payload.get("positions") or []
            count = payload.get("count") or 0
        if not page:
            break
        positions.extend(page)
        start += len(page)
        if count and start >= count:
            break
    return positions


def _irish_location(position: dict[str, Any]) -> str:
    locations = [str(item) for item in (position.get("locations") or [])]
    single = str(position.get("location") or "")
    candidates = [*locations, *([single] if single else [])]
    for candidate in candidates:
        if is_explicit_ireland_location(candidate):
            return candidate
    return ""


def extract_eightfold_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str = "",
) -> list[dict[str, Any]]:
    """Extract Irish vacancies from an Eightfold board."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    host, domain = _host_and_domain(listing_url)
    if not host or not domain or (".eightfold.ai" not in host and "domain=" not in listing_url):
        return opportunities
    positions = _list_positions(host, domain, "pcsx") or _list_positions(host, domain, "v2")
    for position in positions:
        location = _irish_location(position)
        if not location:
            continue
        title = str(position.get("name") or "").strip()
        position_id = position.get("id")
        if not title or position_id is None:
            continue
        job_url = (
            str(position.get("canonicalPositionUrl") or position.get("canonical_position_url") or "")
            or f"https://{host}/careers/job/{position_id}"
        )
        if job_url in seen_urls:
            continue
        seen_urls.add(job_url)
        description = f"{employer_name} position: {title}. Location: {location}."
        if len(seen_urls) <= _MAX_DETAILS:
            detail = _get_json(f"https://{host}/api/apply/v2/jobs/{position_id}?domain={domain}")
            if detail:
                body = clean_html_description(str(detail.get("job_description") or ""))
                if body:
                    description = body
        opportunities.append(
            {
                "title": title,
                "company": employer_name,
                "location": location,
                "employment_type": "See job post",
                "salary_text": None,
                "description": description,
                "url": job_url,
                "source": employer_name,
            }
        )
    return opportunities
