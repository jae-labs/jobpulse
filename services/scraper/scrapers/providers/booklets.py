"""Candidate Information Booklets & PDF vacancies adapter (Councils and Public Bodies)."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_pdf_title, clean_text

BOOKLET_KEYWORDS = [
    "advert",
    "booklet",
    "spec",
    "qualifications",
    "surveyor",
    "officer",
    "manager",
    "coordinator",
    "lead",
    "technician",
    "assistant",
    "administrator",
    "director",
    "specialist",
    "analyst",
]

GENERIC_DOC_SKIPS = [
    "policy",
    "application-form",
    "application_form",
    "application form",
    "terms",
    "privacy",
    "accommodations",
    "charter",
]


def extract_booklet_opportunities(
    employer_name: str,
    listing_url: str,
    html_content: str,
    links: list[tuple[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """Extract council and public sector candidate booklet PDF vacancies."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    if links is None:
        raw_links = re.findall(
            r"<a\s+[^>]*href=(?:[\"\']([^\"\']+)[\"\']|([^\s>]+))[^>]*>(.*?)</a>",
            html_content,
            re.I | re.DOTALL,
        )
        links = [(h1 or h2, t) for h1, h2, t in raw_links]

    for h, t in links:
        ct = clean_text(t)
        full = urljoin(listing_url, h.strip())
        fn = h.split("/")[-1]
        if h.endswith(".pdf") and any(k in fn.lower() or k in ct.lower() for k in BOOKLET_KEYWORDS):
            is_generic_doc = any(skip in fn.lower() for skip in GENERIC_DOC_SKIPS) or bool(
                re.search(r"\bform\b", fn.lower())
            )
            if not is_generic_doc:
                title = clean_pdf_title(ct, h)
                if len(title) > 3 and full not in seen_urls:
                    seen_urls.add(full)
                    desc = f"Official {employer_name} vacancy: {title}. Review the candidate information booklet for grade, salary scale, duties, and closing date."
                    salary = extract_salary_from_context(desc, title)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": "Ireland",
                            "employment_type": "See job post",
                            "salary_text": salary,
                            "description": desc,
                            "url": full,
                            "source": employer_name,
                        }
                    )

    return opportunities
