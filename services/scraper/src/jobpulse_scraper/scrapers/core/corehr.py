"""CoreHR higher education recruitment portals scraper (Maynooth, TU Dublin, Trinity)."""

from __future__ import annotations

import re
from typing import Any

from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.repository import save_jobs_batch, update_source_status
from jobpulse_scraper.network.browser import with_browser
from jobpulse_scraper.scrapers.parsers.corehr_core import extract_maynooth_jobs as extract_maynooth_jobs


def fetch_corehr_results(search_url: str) -> str:
    """Submit and paginate a CoreHR vacancy search, returning all result HTML."""

    async def search(page: Any) -> str:
        await page.goto(search_url, wait_until="domcontentloaded")
        form = page.locator('form[name="callErecruitDoSearch"]')
        comp_sel = form.locator('select[name="p_competition_type"]')
        if await comp_sel.count() > 0:
            await comp_sel.select_option("ALLOPTIONS")
        dept_sel = form.locator('select[name="p_department"]')
        if await dept_sel.count() > 0:
            await dept_sel.select_option("ALLOPTIONS")
        async with page.expect_navigation(wait_until="domcontentloaded"):
            await form.evaluate("(element) => element.requestSubmit()")
        await page.locator("td.erq_searchv4_result_row").first.wait_for()
        pages = []
        seen_references = set()
        for _ in range(20):
            content = await page.content()
            references = set(re.findall(r"viewTheJobSpec\('(\d+)'\)", content))
            if not references.difference(seen_references):
                break
            seen_references.update(references)
            pages.append(content)
            next_page = page.get_by_role("link", name="Next", exact=True)
            if not await next_page.count():
                break
            async with page.expect_navigation(wait_until="domcontentloaded"):
                await next_page.click()
            await page.locator("td.erq_searchv4_result_row").first.wait_for()
        return "\n".join(pages)

    return with_browser(search)


def sync_corehr(company: str, search_url: str, location: str) -> SyncReport:
    """Execute Playwright browser search over a CoreHR portal and persist vacancies."""
    page_content = fetch_corehr_results(search_url)
    opportunities = extract_maynooth_jobs(page_content)
    jobs_to_save = []
    for job in opportunities:
        description = f"{job['summary']} Department: {job['department']}. Closing date: {job['closing_date']}."
        url = (
            f"{search_url.split('/erq_search_package', 1)[0]}/erq_jobspec_version_4.display_form?"
            f"p_company=1&p_internal_external=E&p_display_in_irish=N&p_display_apply_ind=Y&p_recruitment_id={job['reference']}"
        )
        jobs_to_save.append(
            {
                "title": job["title"],
                "company": company,
                "location": location,
                "employment_type": job["position_type"],
                "description": description,
                "url": url,
                "source": company,
            }
        )

    added = save_jobs_batch(jobs_to_save, enrich=True)

    detail_msg = f"Read {len(opportunities)} opportunities; added {added} new opportunities."
    update_source_status(company, "Synced", detail_msg, opportunities_found=len(opportunities))
    return SyncReport(
        added,
        f"{company}: {len(opportunities)} opportunities read; {added} new opportunities.",
        found=len(opportunities),
    )


def sync_maynooth() -> SyncReport:
    """Sync Maynooth University CoreHR vacancies."""
    return sync_corehr(
        "Maynooth University",
        "https://my.corehr.com/pls/nuimrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Maynooth, County Kildare",
    )


def sync_tu_dublin() -> SyncReport:
    """Sync Technological University Dublin CoreHR vacancies."""
    return sync_corehr(
        "Technological University Dublin",
        "https://my.corehr.com/pls/tudrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Dublin",
    )


def sync_trinity() -> SyncReport:
    """Sync Trinity College Dublin CoreHR vacancies."""
    return sync_corehr(
        "Trinity College Dublin",
        "https://my.corehr.com/pls/trrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Dublin",
    )


def sync_ucd() -> SyncReport:
    """Sync University College Dublin CoreHR vacancies."""
    return sync_corehr(
        "University College Dublin",
        "https://my.corehr.com/pls/ucdrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Dublin",
    )


def sync_dcu() -> SyncReport:
    """Sync Dublin City University CoreHR vacancies."""
    return sync_corehr(
        "Dublin City University",
        "https://my.corehr.com/pls/dcurecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Dublin",
    )
