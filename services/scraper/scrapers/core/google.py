"""Google careers feed (server-rendered embedded JSON).

A boardless single-company source: the paged results page inlines its whole job
payload in an ``AF_initDataCallback`` ``ds:1`` script block, so one paged list crawl
assembles every posting with no per-posting detail request. The public careers JSON
API is gone, so the list pages are read directly. Only Irish postings are kept.
"""

from __future__ import annotations

import json
import re
from typing import Any

from database.repository import IngestionIncompleteError, save_jobs_batch, update_source_status
from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_html_description
from network.http_client import fetch_page
from scrapers.providers.location import is_explicit_ireland_location

# ``q=Ireland`` filters the catalogue server-side, so only Irish postings are paged.
_LIST_URL = "https://www.google.com/about/careers/applications/jobs/results?q=Ireland&page={page}"
_JOB_URL = "https://www.google.com/about/careers/applications/jobs/results/{job_id}"
_MAX_PAGES = 40

_SCRIPT = re.compile(r"<script[^>]*>(.*?)</script>", re.S)
_DS1_DATA = re.compile(r"data:(\[.*?\]), sideChannel", re.S)


def _ds1_payload(html_text: str) -> list[Any] | None:
    """Return the decoded ``ds:1`` data array, or ``None`` when absent."""
    for match in _SCRIPT.finditer(html_text):
        script = match.group(1)
        if "key: 'ds:1'" not in script:
            continue
        data = _DS1_DATA.search(script)
        if not data:
            continue
        try:
            payload = json.loads(data.group(1))
        except ValueError:
            return None
        return payload if isinstance(payload, list) else None
    return None


def _string(record: list[Any], index: int) -> str:
    if index >= len(record):
        return ""
    value = record[index]
    return value if isinstance(value, str) else ""


def _locations(record: list[Any], index: int) -> list[str]:
    if index >= len(record) or not isinstance(record[index], list):
        return []
    names: list[str] = []
    for entry in record[index]:
        if isinstance(entry, list) and entry and isinstance(entry[0], str) and entry[0]:
            names.append(entry[0])
    return names


def _html_field(record: list[Any], index: int) -> str:
    """Decode a ``[null, "<html>"]`` field at ``index``, returning the HTML string."""
    if index >= len(record) or not isinstance(record[index], list):
        return ""
    pair = record[index]
    return pair[1] if len(pair) >= 2 and isinstance(pair[1], str) else ""


def extract_google_items(records: list[Any]) -> list[dict[str, Any]]:
    """Normalize the embedded job records into Irish opportunity dictionaries."""
    opportunities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in records:
        if not isinstance(record, list):
            continue
        job_id = _string(record, 0)
        title = _string(record, 1).strip()
        if not job_id or not title:
            continue
        location = next((name for name in _locations(record, 9) if is_explicit_ireland_location(name)), "")
        if not location:
            continue
        job_url = _JOB_URL.format(job_id=job_id)
        if job_url in seen:
            continue
        seen.add(job_url)
        description = clean_html_description(_html_field(record, 10) + _html_field(record, 3) + _html_field(record, 4))
        opportunities.append(
            {
                "title": title,
                "company": _string(record, 7).strip() or "Google",
                "location": location,
                "employment_type": "See job post",
                "salary_text": extract_salary_from_context(description, title),
                "description": description or f"Google position: {title}. Location: {location}.",
                "url": job_url,
                "source": "Google",
            }
        )
    return opportunities


def sync_google(max_pages: int = _MAX_PAGES) -> tuple[int, str]:
    """Scrape and ingest Irish vacancies from Google's own careers catalogue."""
    total_saved = 0
    total_read = 0
    for page in range(1, max_pages + 1):
        try:
            payload = _ds1_payload(fetch_page(_LIST_URL.format(page=page)))
            if not payload or not isinstance(payload[0], list):
                raise ValueError("Missing Google listing payload")
        except Exception as exc:
            update_source_status(
                "Google",
                "Failed",
                "Listing request failed; existing vacancies retained.",
                opportunities_found=total_saved,
            )
            raise IngestionIncompleteError(total_saved, 0, 0) from exc

        if not payload:
            break
        records = payload[0] if payload and isinstance(payload[0], list) else []
        total = payload[2] if len(payload) > 2 and isinstance(payload[2], int) else 0
        if not records:
            break
        opportunities = extract_google_items(records)
        total_read += len(records)
        if opportunities:
            try:
                total_saved += save_jobs_batch(opportunities, enrich=True)
            except IngestionIncompleteError as exc:
                raise IngestionIncompleteError(total_saved + exc.persisted, exc.failed, exc.vectors_pending) from exc
        if total and total_read >= total:
            break

    else:
        update_source_status("Google", "Failed", "Listing exceeded the crawl limit; existing vacancies retained.")
        raise IngestionIncompleteError(total_saved, 0, 0)

    if total_read == 0:
        detail = "Google sync completed but found 0 active vacancies."
        update_source_status("Google", "Synced", detail, opportunities_found=0)
        return 0, detail
    detail = f"Read {total_read} vacancies; persisted {total_saved} Irish opportunities."
    update_source_status("Google", "Synced", detail, opportunities_found=total_saved)
    return total_saved, f"Google: {total_saved} opportunities added or refreshed."
