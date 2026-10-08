"""Kerry Group careers scraper."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.repository import save_jobs_batch, update_source_status
from jobpulse_scraper.network.browser import with_browser
from jobpulse_scraper.scrapers.parsers.kerry_core import extract_kerry_job_details as extract_kerry_job_details

KERRY_CAREERS_URL = "https://jobs.kerry.com/gb/en/search-results"


def sync_kerry() -> SyncReport:
    """Launch browser, search Kerry Group Ireland positions, and persist vacancies."""

    async def search(page: Any) -> list[dict[str, str]]:
        await page.goto(KERRY_CAREERS_URL, wait_until="domcontentloaded")
        await page.locator('input[aria-label^="Ireland("]').check()
        await page.wait_for_timeout(1500)
        jobs = await page.locator('a[href*="/job/"]').evaluate_all(
            """items => [...new Map(items.map(a => [
                a.href,
                {title: a.innerText.trim().replace(/\\s+/g, ' '), url: a.href}
            ])).values()].filter(job => job.title)"""
        )
        for job in jobs:
            try:
                await page.goto(job["url"], wait_until="domcontentloaded", timeout=15000)
                await page.wait_for_timeout(1000)
                job.update(extract_kerry_job_details(await page.locator("body").inner_text()))
            except Exception:
                pass
        return jobs

    opportunities = with_browser(search)
    jobs_to_save = []
    ireland_opportunities = [job for job in opportunities if "ireland" in job["location"].lower()]

    for job in ireland_opportunities:
        if "permanent" not in job["employment_type"].lower():
            continue
        title = job["title"]
        jobs_to_save.append(
            {
                "title": title,
                "company": "Kerry Group",
                "location": job["location"],
                "employment_type": job["employment_type"],
                "description": job["description"],
                "url": job["url"],
                "source": "Kerry Group",
            }
        )

    added = save_jobs_batch(jobs_to_save, enrich=True)

    permanent = sum("permanent" in job["employment_type"].lower() for job in ireland_opportunities)
    detail_msg = f"Read {len(ireland_opportunities)} Ireland opportunities; kept {permanent} permanent opportunities and added {added} new opportunities."
    update_source_status("Kerry Group", "Synced", detail_msg, opportunities_found=permanent)
    return SyncReport(
        added,
        f"Kerry Group: {len(ireland_opportunities)} Ireland opportunities read; {added} new permanent opportunities.",
        found=permanent,
    )
