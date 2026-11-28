"""Pure supplied-source parsing for corehr acquisition workflows."""

from __future__ import annotations

import re

from jobpulse_scraper.engine.text_cleaner import clean_text


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
