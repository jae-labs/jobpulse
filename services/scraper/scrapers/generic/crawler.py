"""Concurrent watchlist crawler and single-employer synchronization."""

from __future__ import annotations

import concurrent.futures
import threading
from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlparse

from config.loader import get_employers_tuples
from database.repository import IngestionIncompleteError, save_jobs_batch, update_employer_status, update_source_status
from network.browser import fetch_via_browser
from pipeline.logger import format_error_message, log_scraper_event
from scrapers.generic.discovery import discover_employer_careers, is_auth_wall
from scrapers.generic.listing import extract_jobs_from_listing


class ScrapeOutcome(StrEnum):
    """Terminal state of a source scrape, suitable for UI and retry decisions."""

    SYNCED = "synced"
    EMPTY = "empty"
    BLOCKED = "blocked"
    AUTH_WALL = "auth_wall"
    UNSUPPORTED = "unsupported"
    FAILED = "failed"


@dataclass(frozen=True)
class EmployerSyncResult:
    """Structured result for one employer scrape."""

    added: int
    opportunities_found: int
    discovered_url: str
    message: str
    outcome: ScrapeOutcome
    detail: str
    failed_writes: int = 0
    vectors_pending: int = 0

    def as_dict(self, employer: str) -> dict[str, Any]:
        return {
            "employer": employer,
            "outcome": self.outcome.value,
            "opportunities_found": self.opportunities_found,
            "added": self.added,
            "persisted": self.added,
            "failed_writes": self.failed_writes,
            "vectors_pending": self.vectors_pending,
            "url": self.discovered_url,
            "detail": self.detail,
        }


EMPTY_BOARD_MARKERS = (
    "no jobs found",
    "no jobs available",
    "no open positions",
    "no open roles",
    "no current opportunities",
    "there are currently no",
    "0 jobs found",
    "0 results found",
)


def has_explicit_empty_board(html_data: str) -> bool:
    """Return True only when a careers page explicitly states that its board is empty."""
    page_text = (html_data or "").lower()
    return any(marker in page_text for marker in EMPTY_BOARD_MARKERS)


def _result(
    *,
    added: int = 0,
    opportunities_found: int = 0,
    discovered_url: str,
    message: str,
    outcome: ScrapeOutcome,
    detail: str,
    failed_writes: int = 0,
    vectors_pending: int = 0,
) -> EmployerSyncResult:
    return EmployerSyncResult(
        added=added,
        opportunities_found=opportunities_found,
        discovered_url=discovered_url,
        message=message,
        outcome=outcome,
        detail=detail,
        failed_writes=failed_writes,
        vectors_pending=vectors_pending,
    )


def classify_unusable_page(url: str, html_data: str, *, inspect_content: bool = True) -> str | None:
    """Explain terminal interstitials instead of mislabelling them as empty boards."""
    url_l = (url or "").lower()
    page_l = (html_data or "").lower()
    if url_l.startswith(("about:", "chrome-error:", "edge-error:")):
        return "Browser navigation failed before the careers page loaded."
    if "apply.workable.com/oops" in url_l:
        return "Workable reports that this careers-board URL no longer exists."
    if not inspect_content:
        return None
    # Classify only visible challenge text; ATS scripts often mention challenge components.
    if any(
        marker in page_l for marker in ("verify you are human", "captcha required", "access denied", "request blocked")
    ):
        return "Anti-bot challenge or access block prevented the opportunities list from loading."
    if any(marker in page_l for marker in ("cookie preferences", "cookie settings")) and len(page_l) < 9000:
        return "Cookie-consent page loaded without the opportunities list."
    # Treat 404 text as terminal only on an explicit error URL.
    if "/errors/404" in url_l or "/404" in url_l:
        return "The configured careers URL resolves to a page-not-found response."
    return None


def sync_single_employer(
    name: str,
    careers_url: str,
    sector: str = "General",
    priority: int = 50,
) -> EmployerSyncResult:
    """
    Scrape a single employer:
    1. Discovers the active careers / ATS portal.
    2. Extracts all opportunities.
    3. Saves each opportunity to Supabase.
    4. Updates employer and source status.
    Returns a typed result that distinguishes an empty board from scrape failures.
    """
    discovered_url = careers_url
    fetch_method = "HTTP"
    log_scraper_event("QUERYING", name, "Querying website", careers_url, method="HTTP")
    try:
        try:
            discovered_url, html_data = discover_employer_careers(name, careers_url)
        except HTTPError as e:
            if e.code != 403:
                raise
            log_scraper_event("INFO", name, "HTTP 403 blocked - retrying via Playwright", careers_url, method="HTTP")
            fetch_method = "Playwright"
            discovered_url, html_data = fetch_via_browser(careers_url, wait_for_idle=True)

        if is_auth_wall(discovered_url):
            if fetch_method == "HTTP":
                log_scraper_event(
                    "INFO",
                    name,
                    "Resolved to potential bot-protection login via HTTP - retrying via Playwright",
                    careers_url,
                    method="HTTP",
                )
                fetch_method = "Playwright"
                try:
                    discovered_url, html_data = fetch_via_browser(careers_url, wait_for_idle=True)
                except Exception as b_err:
                    log_scraper_event(
                        "WARNING", name, f"Playwright fallback failed: {b_err}", careers_url, method="Playwright"
                    )

            if is_auth_wall(discovered_url):
                log_scraper_event(
                    "AUTH_WALL",
                    name,
                    "Resolved to a login/SSO page - cannot scrape without credentials",
                    discovered_url,
                    method=fetch_method,
                )
                detail = "Careers page redirects to a login/SSO wall."
                update_employer_status(
                    name=name, status="Auth wall", opportunities_found=0, discovered_jobs_url=discovered_url
                )
                update_source_status(
                    name=name,
                    status="Auth wall",
                    detail=detail,
                    opportunities_found=0,
                    url=discovered_url,
                    mode="company crawler",
                )
                return _result(
                    discovered_url=discovered_url,
                    message=f"{name}: auth wall at {discovered_url}.",
                    outcome=ScrapeOutcome.AUTH_WALL,
                    detail=detail,
                )

        unusable_reason = classify_unusable_page(discovered_url, html_data, inspect_content=False)
        if unusable_reason:
            log_scraper_event("UNAVAILABLE", name, unusable_reason, discovered_url, method=fetch_method)
            outcome = (
                ScrapeOutcome.BLOCKED
                if "challenge" in unusable_reason.lower() or "cookie" in unusable_reason.lower()
                else ScrapeOutcome.FAILED
            )
            status = "Blocked" if outcome is ScrapeOutcome.BLOCKED else "Failed"
            update_employer_status(name=name, status=status, opportunities_found=0, discovered_jobs_url=discovered_url)
            update_source_status(
                name=name,
                status=status,
                detail=unusable_reason,
                opportunities_found=0,
                url=discovered_url,
                mode="company crawler",
            )
            return _result(
                discovered_url=discovered_url,
                message=f"{name}: {outcome.value} ({unusable_reason}) at {discovered_url}.",
                outcome=outcome,
                detail=unusable_reason,
            )

        opportunities = extract_jobs_from_listing(name, discovered_url, html_data) if html_data else []

        # Render empty HTTP results in a browser to catch client-rendered listings.
        fallback_error: str | None = None
        if not opportunities and fetch_method == "HTTP":
            try:
                log_scraper_event(
                    "INFO",
                    name,
                    "0 HTTP opportunities - retrying via Playwright in case of client-rendered content",
                    discovered_url,
                    method="Playwright",
                )
                browser_url, browser_html = fetch_via_browser(discovered_url, wait_for_idle=True)
                if browser_html:
                    fetch_method = "Playwright"
                    discovered_url = browser_url
                    html_data = browser_html
                    opportunities = extract_jobs_from_listing(name, discovered_url, html_data)
            except Exception as b_err:
                fallback_error = format_error_message(b_err)
                log_scraper_event(
                    "WARNING",
                    name,
                    f"Playwright fallback failed: {fallback_error}",
                    discovered_url,
                    method="Playwright",
                )

        # Use the CoreHR form flow for discovered CoreHR tenants.
        if not opportunities and "corehr.com" in discovered_url.lower():
            try:
                from scrapers.core.corehr import fetch_corehr_results

                html_data = fetch_corehr_results(discovered_url)
                opportunities = extract_jobs_from_listing(name, discovered_url, html_data)
                fetch_method = "Playwright"
            except Exception as corehr_err:
                fallback_error = format_error_message(corehr_err)
                log_scraper_event(
                    "WARNING",
                    name,
                    f"CoreHR search fallback failed: {fallback_error}",
                    discovered_url,
                    method="Playwright",
                )

        if not opportunities:
            unusable_reason = classify_unusable_page(discovered_url, html_data)
            if unusable_reason:
                log_scraper_event("UNAVAILABLE", name, unusable_reason, discovered_url, method=fetch_method)
                outcome = (
                    ScrapeOutcome.BLOCKED
                    if "challenge" in unusable_reason.lower() or "cookie" in unusable_reason.lower()
                    else ScrapeOutcome.FAILED
                )
                status = "Blocked" if outcome is ScrapeOutcome.BLOCKED else "Failed"
                update_employer_status(
                    name=name, status=status, opportunities_found=0, discovered_jobs_url=discovered_url
                )
                update_source_status(
                    name=name,
                    status=status,
                    detail=unusable_reason,
                    opportunities_found=0,
                    url=discovered_url,
                    mode="company crawler",
                )
                return _result(
                    discovered_url=discovered_url,
                    message=f"{name}: {outcome.value} ({unusable_reason}) at {discovered_url}.",
                    outcome=outcome,
                    detail=unusable_reason,
                )

            if fallback_error:
                detail = f"No opportunities extracted; browser fallback failed: {fallback_error}"
                update_employer_status(
                    name=name, status="Failed", opportunities_found=0, discovered_jobs_url=discovered_url
                )
                update_source_status(
                    name=name,
                    status="Failed",
                    detail=detail,
                    opportunities_found=0,
                    url=discovered_url,
                    mode="company crawler",
                )
                return _result(
                    discovered_url=discovered_url,
                    message=f"{name}: failed ({detail}).",
                    outcome=ScrapeOutcome.FAILED,
                    detail=detail,
                )

            if has_explicit_empty_board(html_data):
                detail = "Careers board explicitly reports no open opportunities."
                update_employer_status(
                    name=name, status="Empty", opportunities_found=0, discovered_jobs_url=discovered_url
                )
                update_source_status(
                    name=name,
                    status="Empty",
                    detail=detail,
                    opportunities_found=0,
                    url=discovered_url,
                    mode="company crawler",
                )
                log_scraper_event("EMPTY", name, detail, discovered_url, method=fetch_method)
                return _result(
                    discovered_url=discovered_url,
                    message=f"{name}: 0 opportunities found (board is explicitly empty).",
                    outcome=ScrapeOutcome.EMPTY,
                    detail=detail,
                )

            detail = "No opportunities extracted and no explicit empty-board signal was found; parser or ATS support is required."
            update_employer_status(
                name=name, status="Unsupported", opportunities_found=0, discovered_jobs_url=discovered_url
            )
            update_source_status(
                name=name,
                status="Unsupported",
                detail=detail,
                opportunities_found=0,
                url=discovered_url,
                mode="company crawler",
            )
            log_scraper_event("UNSUPPORTED", name, detail, discovered_url, method=fetch_method)
            return _result(
                discovered_url=discovered_url,
                message=f"{name}: unsupported careers board at {discovered_url}.",
                outcome=ScrapeOutcome.UNSUPPORTED,
                detail=detail,
            )

        added = save_jobs_batch(opportunities)

        status_text = "Synced"
        detail_text = f"Discovered job listing at {discovered_url}. Found {len(opportunities)} opportunities; saved or updated {added} vacancies."

        update_employer_status(
            name=name,
            status=status_text,
            opportunities_found=len(opportunities),
            discovered_jobs_url=discovered_url,
        )
        update_source_status(
            name=name,
            status=status_text,
            detail=detail_text,
            opportunities_found=len(opportunities),
            url=discovered_url,
            mode="company crawler",
        )

        log_scraper_event(
            "SUCCESS",
            name,
            f"{len(opportunities)} opportunities found ({added} vacancies saved or updated)",
            discovered_url,
            method=fetch_method,
        )
        msg = f"{name}: {len(opportunities)} opportunities found at {discovered_url} ({added} vacancies saved or updated)."
        return _result(
            added=added,
            opportunities_found=len(opportunities),
            discovered_url=discovered_url,
            message=msg,
            outcome=ScrapeOutcome.SYNCED,
            detail=detail_text,
        )
    except Exception as e:
        err_detail = format_error_message(e)
        log_scraper_event("ERROR", name, f"Error ({err_detail})", discovered_url, method="HTTP")
        update_employer_status(name=name, status="Failed")
        update_source_status(name=name, status="Failed", detail=err_detail)
        return _result(
            added=e.persisted if isinstance(e, IngestionIncompleteError) else 0,
            failed_writes=e.failed if isinstance(e, IngestionIncompleteError) else 0,
            vectors_pending=e.vectors_pending if isinstance(e, IngestionIncompleteError) else 0,
            discovered_url=discovered_url,
            message=f"{name}: failed during scraping ({err_detail}).",
            outcome=ScrapeOutcome.FAILED,
            detail=err_detail,
        )


def sync_watchlist_employers(
    employers_list: list[tuple[str, str, int, str]] | None = None,
    max_workers: int = 6,
    max_workers_per_domain: int = 1,
) -> tuple[int, list[tuple[str, EmployerSyncResult]]]:
    """Crawl employers concurrently while limiting requests to each configured domain."""
    if employers_list is None:
        employers_list = get_employers_tuples(enabled_only=True)
    if max_workers_per_domain < 1:
        raise ValueError("max_workers_per_domain must be at least 1")

    total_added = 0
    results: list[tuple[str, EmployerSyncResult]] = []
    semaphore_lock = threading.Lock()
    domain_semaphores: dict[str, threading.BoundedSemaphore] = {}

    def sync_with_domain_limit(employer: tuple[str, str, int, str]) -> EmployerSyncResult:
        name, sector, priority, careers_url = employer
        domain = (urlparse(careers_url).hostname or careers_url).lower()
        with semaphore_lock:
            semaphore = domain_semaphores.setdefault(domain, threading.BoundedSemaphore(max_workers_per_domain))
        with semaphore:
            return sync_single_employer(name, careers_url, sector, priority)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_emp = {executor.submit(sync_with_domain_limit, emp): emp[0] for emp in employers_list}
        for future in concurrent.futures.as_completed(future_to_emp):
            emp_name = future_to_emp[future]
            try:
                result = future.result()
                total_added += result.added
                results.append((emp_name, result))
            except Exception as exc:
                err_detail = format_error_message(exc)
                log_scraper_event("ERROR", emp_name, f"Exception ({err_detail})", method="HTTP")
                results.append(
                    (
                        emp_name,
                        _result(
                            discovered_url="",
                            message=f"{emp_name}: failed ({err_detail}).",
                            outcome=ScrapeOutcome.FAILED,
                            detail=err_detail,
                        ),
                    )
                )

    return total_added, results
