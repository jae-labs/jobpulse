"""CoreHR higher education recruitment portals scraper (Maynooth, TU Dublin, Trinity)."""

from __future__ import annotations

import re
from typing import Any

from database.repository import save_job, update_source_status
from engine.text_cleaner import clean_text
from network.browser import with_browser


def extract_maynooth_jobs(page: str) -> list[dict[str, str]]:
    """Parse CoreHR search results table HTML for vacancy records."""
    rows = re.split(r'<td class="erq_searchv4_result_row">', page, flags=re.IGNORECASE)[1:]
    jobs = []
    for row in rows:
        title = re.search(r'erq_searchv4_big_anchor"[^>]*>(.*?)</a>', row, flags=re.IGNORECASE | re.DOTALL)
        reference = re.search(r"viewTheJobSpec\('(\d+)'\)", row)
        if not reference:
            reference = re.search(
                r'(?:Vacancy ID|Job ID) : </td>\s*<td class="erq_searchv4_heading5_text">(.*?)</td>',
                row,
                flags=re.IGNORECASE | re.DOTALL,
            )
        position_type = re.search(
            r'(?:Position Type|Contract Type) : </td>\s*<td class="erq_searchv4_heading5_text">(.*?)</td>',
            row,
            flags=re.IGNORECASE | re.DOTALL,
        )
        department = re.search(
            r'Department : </td>\s*<td class="erq_searchv4_heading5_text">(.*?)</td>',
            row,
            flags=re.IGNORECASE | re.DOTALL,
        )
        closing_date = re.search(
            r'Closing Date : </td>\s*<td class="erq_searchv4_heading5_text">(.*?)</td>',
            row,
            flags=re.IGNORECASE | re.DOTALL,
        )
        summary = re.search(r'<div>(.*?)<a href="javascript:viewTheJobSpec', row, flags=re.IGNORECASE | re.DOTALL)
        title_text = clean_text(title.group(1)) if title else ""
        contract_from_title = re.search(
            r"\(([^)]*(?:Permanent|Fixed Term|Specified Purpose)[^)]*)\)", title_text, flags=re.IGNORECASE
        )
        position_text = (
            clean_text(position_type.group(1))
            if position_type
            else (contract_from_title.group(1) if contract_from_title else title_text)
        )
        if not title or not reference:
            continue
        jobs.append(
            {
                "title": re.sub(
                    r"\s*\((?:Reference|Permanent|Fixed Term|Specified Purpose).*?\)",
                    "",
                    title_text,
                    flags=re.IGNORECASE,
                ).strip(),
                "reference": clean_text(reference.group(1)),
                "position_type": position_text,
                "department": clean_text(department.group(1)) if department else "Not specified",
                "closing_date": clean_text(closing_date.group(1)) if closing_date else "Not specified",
                "summary": clean_text(summary.group(1)) if summary else "",
            }
        )
    return jobs


def fetch_corehr_results(search_url: str) -> str:
    """Submit and paginate a CoreHR vacancy search, returning all result HTML."""

    def search(page: Any) -> str:
        page.goto(search_url, wait_until="domcontentloaded")
        form = page.locator('form[name="callErecruitDoSearch"]')
        comp_sel = form.locator('select[name="p_competition_type"]')
        if comp_sel.count() > 0:
            comp_sel.select_option("ALLOPTIONS")
        dept_sel = form.locator('select[name="p_department"]')
        if dept_sel.count() > 0:
            dept_sel.select_option("ALLOPTIONS")
        with page.expect_navigation(wait_until="domcontentloaded"):
            form.evaluate("(element) => element.requestSubmit()")
        page.locator("td.erq_searchv4_result_row").first.wait_for()
        pages = []
        seen_references = set()
        for _ in range(20):
            content = page.content()
            references = set(re.findall(r"viewTheJobSpec\('(\d+)'\)", content))
            if not references.difference(seen_references):
                break
            seen_references.update(references)
            pages.append(content)
            next_page = page.get_by_role("link", name="Next", exact=True)
            if not next_page.count():
                break
            with page.expect_navigation(wait_until="domcontentloaded"):
                next_page.click()
            page.locator("td.erq_searchv4_result_row").first.wait_for()
        return "\n".join(pages)

    return with_browser(search)


def sync_corehr(company: str, search_url: str, location: str) -> tuple[int, str]:
    """Execute Playwright browser search over a CoreHR portal and persist vacancies."""
    page_content = fetch_corehr_results(search_url)
    opportunities = extract_maynooth_jobs(page_content)
    added = 0
    for job in opportunities:
        description = f"{job['summary']} Department: {job['department']}. Closing date: {job['closing_date']}."
        url = (
            f"{search_url.split('/erq_search_package', 1)[0]}/erq_jobspec_version_4.display_form?"
            f"p_company=1&p_internal_external=E&p_display_in_irish=N&p_display_apply_ind=Y&p_recruitment_id={job['reference']}"
        )
        if save_job(
            {
                "title": job["title"],
                "company": company,
                "location": location,
                "employment_type": job["position_type"],
                "description": description,
                "url": url,
                "source": company,
            }
        ):
            added += 1

    detail_msg = f"Read {len(opportunities)} opportunities; added {added} new opportunities."
    update_source_status(company, "Synced", detail_msg, opportunities_found=len(opportunities))
    return added, f"{company}: {len(opportunities)} opportunities read; {added} new opportunities."


def sync_maynooth() -> tuple[int, str]:
    """Sync Maynooth University CoreHR vacancies."""
    return sync_corehr(
        "Maynooth University",
        "https://my.corehr.com/pls/nuimrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Maynooth, County Kildare",
    )


def sync_tu_dublin() -> tuple[int, str]:
    """Sync Technological University Dublin CoreHR vacancies."""
    return sync_corehr(
        "Technological University Dublin",
        "https://my.corehr.com/pls/tudrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Dublin",
    )


def sync_trinity() -> tuple[int, str]:
    """Sync Trinity College Dublin CoreHR vacancies."""
    return sync_corehr(
        "Trinity College Dublin",
        "https://my.corehr.com/pls/trrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Dublin",
    )


def sync_ucd() -> tuple[int, str]:
    """Sync University College Dublin CoreHR vacancies."""
    return sync_corehr(
        "University College Dublin",
        "https://my.corehr.com/pls/ucdrecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Dublin",
    )


def sync_dcu() -> tuple[int, str]:
    """Sync Dublin City University CoreHR vacancies."""
    return sync_corehr(
        "Dublin City University",
        "https://my.corehr.com/pls/dcurecruit/erq_search_package.search_form?p_company=1&p_internal_external=E",
        "Dublin",
    )
