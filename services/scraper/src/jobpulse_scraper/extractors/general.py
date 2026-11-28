"""Generic job detail extraction from structured data or scoped content containers."""

from __future__ import annotations

import re

from jobpulse_scraper.engine.html_body import _JobBodyParser as _JobBodyParser
from jobpulse_scraper.network.http_client import fetch_page


def extract_general_job_detail(
    job_url: str, company: str, title: str, *, html_content: str | None = None
) -> dict[str, str]:
    """Prefer JobPosting text; do not substitute an unscoped entire-page body."""
    try:
        from jobpulse_scraper.scrapers.providers.jsonld import extract_jsonld_opportunities

        page = html_content if html_content is not None else fetch_page(job_url)
        postings = extract_jsonld_opportunities(company, job_url, page, set())
        matching = [posting for posting in postings if posting["title"].casefold() == title.casefold()]
        if len(matching) == 1:
            return {"description": matching[0]["description"]}
        if postings:
            return {}  # Related/redirected postings are not evidence for the requested role.
        from jobpulse_scraper.extractors.booklet_links import find_job_booklet
        from jobpulse_scraper.extractors.pdf import extract_pdf_job_spec

        booklet_url = find_job_booklet(page, title, job_url)
        if booklet_url:
            return {
                key: value for key, value in extract_pdf_job_spec(booklet_url, title).items() if isinstance(value, str)
            }
        parser = _JobBodyParser()
        parser.feed(page)
        if parser.dedicated_bodies:
            return {"description": max(parser.dedicated_bodies, key=len)}
        # A main/article on a careers landing page must not masquerade as job detail.
        scoped = [
            body
            for body in parser.bodies
            if title.casefold() in body.casefold()
            and re.search(
                r"responsibilities|requirements|qualifications|duties|about the role|what you|your role",
                body,
                re.IGNORECASE,
            )
        ]
        return {"description": max(scoped, key=len)} if scoped else {}
    except Exception:
        return {}
