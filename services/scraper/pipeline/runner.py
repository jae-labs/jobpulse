"""Scraper pipeline orchestrator."""

from __future__ import annotations

import re
from typing import Any

from config.loader import get_employers_tuples
from database.repository import (
    deduplicate_database_jobs,
    get_employer,
    prune_stale_jobs,
    update_employer_status,
    update_source_status,
)
from pipeline.logger import format_error_message, log_scraper_event
from scrapers.generic.crawler import sync_single_employer, sync_watchlist_employers
from scrapers.registry import find_core_scraper_by_name, get_core_scrapers


def synchronize(
    employer: str | None = None,
    limit: int | None = None,
    full: bool = True,
    skip_core: bool = False,
    core_only: bool = False,
) -> dict[str, Any]:
    """
    Run scraping pipeline across employers:
    - If employer name specified: target that single employer (specialized core or watchlist).
    - Otherwise: execute core specialized scrapers followed by watchlist employers.
    - Post-scrape: execute safe lifecycle pruning for postings older than prune_days.
    """

    core_scrapers = get_core_scrapers()

    if employer:
        # 1. Check if target employer is one of the specialized core scrapers
        core_match = find_core_scraper_by_name(employer)
        if core_match:
            sync_func, name, url, method = core_match
            log_scraper_event("QUERYING", name, "Querying specialized scraper", url, method=method)
            try:
                count, message = sync_func()
                clean_msg = message.removeprefix(f"{name}: ").strip()
                m_found = re.search(r"(\d+)\s+(?:vacanc|role|opportunit|job|record)", clean_msg, re.I)
                found_count = int(m_found.group(1)) if m_found else count
                update_employer_status(
                    name=name,
                    status="Synced" if found_count > 0 else "Monitored",
                    opportunities_found=found_count,
                    discovered_jobs_url=url,
                )
                if " 0 opportunit" in message or " 0 relevant " in message:
                    log_scraper_event("ZERO", name, "0 opportunities found", url, method=method)
                else:
                    log_scraper_event("SUCCESS", name, clean_msg, url, method=method)
                return {"added": count, "messages": [message], "scraped_employers": 1}
            except Exception as error:
                err_detail = format_error_message(error)
                update_source_status(name, "Unavailable", err_detail)
                update_employer_status(name, "Unavailable", opportunities_found=0, discovered_jobs_url=url)
                log_scraper_event("ERROR", name, f"Error ({err_detail})", url, method=method)
                return {"added": 0, "messages": [f"{name}: error ({err_detail})"], "scraped_employers": 1}

        # 2. Check in loaded watchlist configuration
        watchlist = get_employers_tuples()
        match = next((e for e in watchlist if e[0].lower() == employer.lower()), None)
        if match:
            result = sync_single_employer(match[0], match[3], match[1], match[2])
            return {
                "added": result.added,
                "messages": [result.message],
                "outcomes": [result.as_dict(match[0])],
                "scraped_employers": 1,
            }

        # 3. Check in Supabase employers table
        emp_row = get_employer(employer)
        if emp_row:
            result = sync_single_employer(
                emp_row["name"], emp_row["careers_url"], emp_row.get("sector", "General"), emp_row.get("priority", 50)
            )
            return {
                "added": result.added,
                "messages": [result.message],
                "outcomes": [result.as_dict(emp_row["name"])],
                "scraped_employers": 1,
            }

        log_scraper_event("ERROR", employer, "Employer not found in watchlist or database", method="Search")
        return {"added": 0, "messages": [f"Employer '{employer}' not found in watchlist."], "scraped_employers": 0}

    messages: list[str] = []
    outcomes: list[dict[str, Any]] = []
    added = 0
    scraped_employers_count = 0

    # 1. Run core specialized scrapers
    if not skip_core:
        log_scraper_event("PHASE", "Phase 1/2", f"Running {len(core_scrapers)} Core Specialized Scrapers")
        for sync_func, name, url, method in core_scrapers:
            scraped_employers_count += 1
            log_scraper_event("QUERYING", name, "Querying specialized scraper", url, method=method)
            try:
                count, message = sync_func()
                added += count
                messages.append(message)
                clean_msg = message.removeprefix(f"{name}: ").strip()
                m_found = re.search(r"(\d+)\s+(?:vacanc|role|opportunit|job|record)", clean_msg, re.I)
                found_count = int(m_found.group(1)) if m_found else count
                update_employer_status(
                    name=name,
                    status="Synced" if found_count > 0 else "Monitored",
                    opportunities_found=found_count,
                    discovered_jobs_url=url,
                )
                if " 0 opportunit" in message or " 0 relevant " in message:
                    log_scraper_event("ZERO", name, "0 opportunities found", url, method=method)
                else:
                    log_scraper_event("SUCCESS", name, clean_msg, url, method=method)
            except Exception as error:
                err_detail = format_error_message(error)
                update_source_status(name, "Unavailable", err_detail)
                update_employer_status(name, "Unavailable", opportunities_found=0, discovered_jobs_url=url)
                messages.append(f"{name}: unavailable ({err_detail}); existing results retained.")
                log_scraper_event("ERROR", name, f"Error ({err_detail})", url, method=method)

    # 2. Run watchlist scrapers for remaining employers
    if not core_only:
        core_names = {name for _, name, _, _ in core_scrapers}
        watchlist = get_employers_tuples(enabled_only=True)
        remaining = [e for e in watchlist if e[0] not in core_names]
        if limit:
            remaining = remaining[:limit]
        elif not full:
            # Default: sync top 20 remaining watchlist employers by priority
            remaining = sorted(remaining, key=lambda e: e[2], reverse=True)[:20]

        scraped_employers_count += len(remaining)
        log_scraper_event("PHASE", "Phase 2/2", f"Running {len(remaining)} Watchlist Employers (concurrent workers)")
        watchlist_added, watchlist_results = sync_watchlist_employers(remaining, max_workers=8)
        added += watchlist_added
        messages.extend(result.message for _, result in watchlist_results)
        outcomes.extend(result.as_dict(name) for name, result in watchlist_results)

    dedupe_stats = {}
    prune_stats = {}
    if not employer:
        # 1. Always deduplicate database records by default
        try:
            dedupe_stats = deduplicate_database_jobs()
        except Exception as exc:
            # A completed scrape must not be reported as a process failure just
            # because a non-essential database maintenance pass is temporarily
            # unavailable (for example during an offline local check).
            log_scraper_event("WARNING", "Database deduplication", format_error_message(exc), method="Supabase")
        # 2. Always prune stale postings older than 3 days by default
        try:
            prune_stats = prune_stale_jobs(retention_days=3)
        except Exception as exc:
            log_scraper_event("WARNING", "Database pruning", format_error_message(exc), method="Supabase")

    return {
        "added": added,
        "messages": messages,
        "outcomes": outcomes,
        "scraped_employers": scraped_employers_count,
        "dedupe_stats": dedupe_stats,
        "prune_stats": prune_stats,
    }
