"""JobsIreland.ie Department of Social Protection (Intreo) careers scraper."""

from __future__ import annotations

import math
import os
import re
import time as time
from typing import Any
from urllib.parse import urlencode

from jobpulse_scraper.config.loader import JOBSIRELAND_API_URL
from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.client import get_supabase, retry_supabase
from jobpulse_scraper.database.records import response_records
from jobpulse_scraper.database.repository import IngestionIncompleteError, save_jobs_batch, update_source_status
from jobpulse_scraper.engine.description_quality import has_description_body
from jobpulse_scraper.extractors.jobsireland import extract_jobsireland_job_spec
from jobpulse_scraper.network.http_client import fetch_page
from jobpulse_scraper.scrapers.parsers.jobsireland_core import extract_jobsireland_cards as extract_jobsireland_cards
from jobpulse_scraper.scrapers.parsers.jobsireland_core import parse_longlats_map as parse_longlats_map

CARD_PATTERN = re.compile(
    r'<div class="job-heading[^"]*"\s+data-vacancyid\s*=\s*"(\d+)"[^>]*>(.*?)(?=(?:<div class="job-heading|\Z))',
    re.DOTALL | re.IGNORECASE,
)
LONGLATS_PATTERN = re.compile(r'<ul\s+class="drop"\s+id="longlats"[^>]*>(.*?)</ul>', re.DOTALL | re.IGNORECASE)


def fetch_jobsireland_page(
    page: int = 1,
    page_size: int = 100,
    vacancy_type_id: int = -1,
    location: str = "",
    keyword: str = "",
) -> tuple[int, list[dict[str, Any]]]:
    """Fetch one paginated window from JobsIreland BrowseJobs endpoint."""
    params: dict[str, str | int] = {
        "page": page,
        "pageSize": page_size,
        "VacancyTypeId": vacancy_type_id,
    }
    if location:
        params["location"] = location
    if keyword:
        params["keyWord"] = keyword

    query_str = urlencode(params)
    endpoint = f"{JOBSIRELAND_API_URL}?{query_str}"
    content = fetch_page(endpoint)

    total_m = re.search(r'class="totalCount"\s+value="(\d+)"', content, re.IGNORECASE)
    if total_m is None:
        raise ValueError("JobsIreland listing response lacks the catalog count")
    total_count = int(total_m.group(1))

    opportunities = extract_jobsireland_cards(content)
    return total_count, opportunities


def pending_jobsireland_details(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Resume missing bodies only, using the persisted catalog as the checkpoint."""
    client = get_supabase()
    complete_urls: set[str] = set()
    for start in range(0, len(jobs), 100):
        urls = [job["url"] for job in jobs[start : start + 100]]
        rows = response_records(
            retry_supabase(
                lambda u=urls: (
                    client.table("jobs")
                    .select("url,description")
                    .eq("source", "JobsIreland.ie")
                    .in_("url", u)
                    .execute()
                )
            ).data
        )
        complete_urls.update(row["url"] for row in rows if has_description_body(row.get("description")))
    return [job for job in jobs if job["url"] not in complete_urls]


def sync_jobsireland(max_pages: int = 100, page_size: int = 100) -> SyncReport:
    """Persist listing pages first, then hydrate missing bodies sequentially."""
    request_delay = float(os.environ.get("JOBSIRELAND_REQUEST_DELAY_SECONDS", "3"))
    if not math.isfinite(request_delay) or request_delay < 1:
        raise ValueError("JOBSIRELAND_REQUEST_DELAY_SECONDS must be finite and at least 1 second")
    if max_pages < 1 or page_size < 1:
        raise ValueError("JobsIreland page limits must be positive")
    discovered: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    total_reported = 0
    total_read = 0
    total_saved = 0
    effective_max_pages = max_pages

    for page in range(1, max_pages + 1):
        try:
            total_count, page_opps = fetch_jobsireland_page(page=page, page_size=page_size)
        except Exception as exc:
            print(f"  [JOBSIRELAND] Page {page} failed: {exc}")
            # A listing failure before the catalogue is exhausted leaves a partial
            # crawl. Keep persisted vacancies and report incomplete so a truncated
            # sync is never mistaken for a completed one.
            update_source_status(
                "JobsIreland.ie",
                "Failed",
                "Listing request failed; existing vacancies retained.",
                opportunities_found=total_saved,
            )
            raise IngestionIncompleteError(total_saved, 0, 0) from exc

        if page == 1:
            total_reported = total_count
            if total_reported > 0:
                calculated_pages = (total_reported + page_size - 1) // page_size
                effective_max_pages = min(max_pages, calculated_pages + 1)

        if not page_opps:
            break

        new_opps = []
        for opp in page_opps:
            if opp["url"] not in seen_urls:
                seen_urls.add(opp["url"])
                new_opps.append(opp)

        total_read += len(page_opps)
        saved = 0
        if new_opps:
            try:
                saved = save_jobs_batch(new_opps, enrich=False)
                discovered.extend(new_opps)
            except IngestionIncompleteError as exc:
                raise IngestionIncompleteError(total_saved + exc.persisted, exc.failed, exc.vectors_pending) from exc
            total_saved += saved

        print(
            f"  [JOBSIRELAND] Page {page}/{effective_max_pages}: fetched {len(page_opps)}, "
            f"saved {saved} ({total_saved} total saved / {total_reported} in catalog)"
        )

        # Reached end of catalog
        if total_reported > 0 and len(seen_urls) >= total_reported:
            break
        if page >= effective_max_pages:
            # The page budget could not cover the reported catalogue: retain the
            # partial result and report incomplete instead of a clean sync.
            if total_reported > page_size * max_pages:
                update_source_status(
                    "JobsIreland.ie",
                    "Failed",
                    "Listing exceeded the crawl limit; existing vacancies retained.",
                    opportunities_found=total_saved,
                )
                raise IngestionIncompleteError(total_saved, 0, 0)
            break

        time.sleep(request_delay)

    if total_reported > len(seen_urls):
        update_source_status(
            "JobsIreland.ie",
            "Failed",
            "Listing ended before the reported catalog was discovered; saved vacancies retained.",
            opportunities_found=total_saved,
        )
        raise IngestionIncompleteError(total_saved, 0, 0)

    if total_read == 0:
        detail_msg = "JobsIreland sync completed but found 0 active vacancies."
        update_source_status("JobsIreland.ie", "Synced", detail_msg, opportunities_found=0)
        return SyncReport(0, detail_msg, found=0)

    details_saved = 0
    try:
        pending = pending_jobsireland_details(discovered)
        print(f"  [JOBSIRELAND] Listing discovery complete; {len(pending)} descriptions pending")
        for job in pending:
            # Includes the transition from the final listing request to the first detail.
            time.sleep(request_delay)
            spec = extract_jobsireland_job_spec(job["url"])
            if not has_description_body(spec.get("description"), minimum_chars=1):
                raise RuntimeError("Published description unavailable; stopping detail requests")
            saved = save_jobs_batch([{**job, "description": spec["description"]}], enrich=False)
            if saved != 1:
                raise RuntimeError("Description was not persisted")
            details_saved += 1
            print(f"  [JOBSIRELAND] Descriptions saved: {details_saved}/{len(pending)}")
    except Exception as exc:
        update_source_status(
            "JobsIreland.ie",
            "Failed",
            f"Description phase incomplete after {details_saved} updates; all discovered vacancies retained. "
            "Rerun to retry missing descriptions.",
            opportunities_found=total_saved,
        )
        vectors_pending = exc.vectors_pending if isinstance(exc, IngestionIncompleteError) else 0
        failed = exc.failed if isinstance(exc, IngestionIncompleteError) else 0
        raise IngestionIncompleteError(total_saved, failed, vectors_pending) from exc

    detail_msg = (
        f"Read {total_read} vacancies across Ireland (catalog total: {total_reported}); "
        f"persisted {total_saved} opportunities."
    )
    update_source_status("JobsIreland.ie", "Synced", detail_msg, opportunities_found=total_saved)
    return SyncReport(
        total_saved, f"JobsIreland.ie: {total_saved} opportunities added or refreshed.", found=total_saved
    )
