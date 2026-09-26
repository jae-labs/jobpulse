"""Universal job spec extractor with protocol and ATS detection."""

from __future__ import annotations

from typing import Any

from extractors.general import extract_general_job_detail
from extractors.pdf import extract_pdf_job_spec
from extractors.playwright_spec import extract_playwright_job_spec
from extractors.workday_cxs import extract_workday_cxs_job_spec


def extract_universal_job_spec(url: str, company: str, title: str, page: Any = None) -> dict[str, str]:
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
    if url_l.endswith(".pdf") or "booklet" in url_l:
        pdf_res = extract_pdf_job_spec(url, title)
        if pdf_res and len(pdf_res.get("description", "")) > 250:
            return pdf_res
    if "publicjobs.tal.net" in url:
        # Import lazily to prevent circular dependencies
        from scrapers.core.publicjobs import extract_publicjobs_detail

        return extract_publicjobs_detail(url, title)
    if "myworkdayjobs.com" in url_l or "workday" in url_l:
        wd_res = extract_workday_cxs_job_spec(url, title)
        if wd_res and len(wd_res.get("description", "")) > 250:
            return wd_res
    if any(
        k in url_l for k in ["taleo", "phenom", "jnj", "mastercard", "deloitte", "medtronic", "statestreet", "abbvie"]
    ):
        res = extract_playwright_job_spec(url, title, company, page=page)
        if res and len(res.get("description", "")) > 250:
            return res
    return extract_general_job_detail(url, company, title)
