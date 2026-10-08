"""Universal job spec extractor with protocol and ATS detection."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from jobpulse_scraper.engine.description_quality import has_description_body
from jobpulse_scraper.extractors.api_details import extract_api_job_spec
from jobpulse_scraper.extractors.general import extract_general_job_detail
from jobpulse_scraper.extractors.jobsireland import extract_jobsireland_job_spec
from jobpulse_scraper.extractors.pdf import extract_pdf_job_spec
from jobpulse_scraper.extractors.playwright_spec import extract_playwright_job_spec
from jobpulse_scraper.extractors.smartrecruiters import extract_smartrecruiters_job_spec
from jobpulse_scraper.extractors.workday_cxs import extract_workday_cxs_job_spec


def extract_universal_job_spec(url: str, company: str, title: str, page: Any = None) -> Mapping[str, str | None]:
    """
    Intelligently route URL to the most suitable extractor:
    - PDF candidate booklets
    - PublicJobs candidate portal
    - Workday CXS JSON API
    - Playwright dynamic rendering for heavy ATS SPAs
    - General HTML extractor fallback
    """
    if not url or not url.startswith("http"):
        return {}
    url_l = url.lower()
    api_spec = extract_api_job_spec(url, company)
    if api_spec.get("description"):
        return api_spec
    if "jobsireland.ie/" in url_l:
        return extract_jobsireland_job_spec(url)
    if "jobs.smartrecruiters.com/" in url_l:
        return extract_smartrecruiters_job_spec(url)
    if url_l.endswith(".pdf") or "booklet" in url_l:
        pdf_res = extract_pdf_job_spec(url, title)
        if pdf_res and has_description_body(pdf_res.get("description")):
            return pdf_res
    if "publicjobs.tal.net" in url:
        # Import lazily to prevent circular dependencies
        from jobpulse_scraper.scrapers.core.publicjobs import extract_publicjobs_detail

        return extract_publicjobs_detail(url, title)
    if "myworkdayjobs.com" in url_l or "workday" in url_l:
        wd_res = extract_workday_cxs_job_spec(url, title)
        if wd_res and has_description_body(wd_res.get("description")):
            return wd_res
    if any(
        k in url_l for k in ["taleo", "phenom", "jnj", "mastercard", "deloitte", "medtronic", "statestreet", "abbvie"]
    ):
        res = extract_playwright_job_spec(url, title, company, page=page)
        if res and has_description_body(res.get("description")):
            return res
    return extract_general_job_detail(url, company, title)
