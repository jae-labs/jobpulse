"""Kerry Group careers scraper."""

from __future__ import annotations

import re
from typing import Any

from database.repository import delete_jobs, save_job, update_source_status
from network.browser import with_browser

KERRY_CAREERS_URL = "https://jobs.kerry.com/gb/en/search-results"


def extract_kerry_job_details(text: str) -> dict[str, str]:
    """Parse text from Kerry job posting page."""
    location = re.search(r"Location:\s*\n(.+)", text)
    employment_type = re.search(r"\n(FT Permanent|FT Fixed Term|\(US\)Full Time)\n", text)
    description = re.search(r"\nDescription\s*\n(.*?)(?:\nWhy join us\?|\nApply now)", text, flags=re.DOTALL)
    return {
        "location": location.group(1).strip() if location else "Ireland",
        "employment_type": employment_type.group(1).strip() if employment_type else "See job post",
        "description": description.group(1).strip() if description else "",
    }


def sync_kerry() -> tuple[int, str]:
    """Launch browser, search Kerry Group Ireland positions, and persist vacancies."""

    def search(page: Any) -> list[dict[str, str]]:
        page.goto(KERRY_CAREERS_URL, wait_until="domcontentloaded")
        page.locator('input[aria-label^="Ireland("]').check()
        page.wait_for_timeout(1500)
        jobs = page.locator('a[href*="/job/"]').evaluate_all(
            """items => [...new Map(items.map(a => [
                a.href,
                {title: a.innerText.trim().replace(/\\s+/g, ' '), url: a.href}
            ])).values()].filter(job => job.title)"""
        )
        for job in jobs:
            try:
                page.goto(job["url"], wait_until="domcontentloaded", timeout=15000)
                page.wait_for_timeout(1000)
                job.update(extract_kerry_job_details(page.locator("body").inner_text()))
            except Exception:
                pass
        return jobs

    opportunities = with_browser(search)
    added = 0
    ireland_opportunities = [job for job in opportunities if "ireland" in job["location"].lower()]

    delete_jobs(company="Kerry Group", not_location_like="%Ireland%")

    for job in ireland_opportunities:
        if "permanent" not in job["employment_type"].lower():
            continue
        title = job["title"]
        if save_job(
            {
                "title": title,
                "company": "Kerry Group",
                "location": job["location"],
                "employment_type": job["employment_type"],
                "description": job["description"],
                "url": job["url"],
                "source": "Kerry Group",
            }
        ):
            added += 1

    permanent = sum("permanent" in job["employment_type"].lower() for job in ireland_opportunities)
    detail_msg = f"Read {len(ireland_opportunities)} Ireland opportunities; kept {permanent} permanent opportunities and added {added} new opportunities."
    update_source_status("Kerry Group", "Synced", detail_msg, opportunities_found=permanent)
    return (
        added,
        f"Kerry Group: {len(ireland_opportunities)} Ireland opportunities read; {added} new permanent opportunities.",
    )
