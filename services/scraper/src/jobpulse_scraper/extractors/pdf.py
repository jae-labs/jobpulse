"""Candidate information booklet and job spec PDF text extractor."""

from __future__ import annotations

from io import BytesIO
from urllib.request import Request

from jobpulse_scraper.engine.description_quality import has_description_body
from jobpulse_scraper.engine.salary import extract_salary_from_context
from jobpulse_scraper.engine.text_cleaner import clean_text
from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen

MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 100
MAX_TEXT_CHARACTERS = 200000


def parse_pdf_job_spec(data: bytes, title: str) -> dict[str, str | None]:
    """Parse a bounded supplied public booklet without performing any requests."""
    from pypdf import PdfReader

    if len(data) > MAX_PDF_BYTES:
        raise ValueError("PDF body exceeds its byte budget")
    if not data or len(data) < 500:
        return {}
    doc = PdfReader(BytesIO(data))
    if len(doc.pages) > MAX_PDF_PAGES:
        raise ValueError("PDF exceeds its page budget")
    parts = []
    characters = 0
    for page in doc.pages:
        text = page.extract_text() or ""
        characters += len(text)
        if characters > MAX_TEXT_CHARACTERS:
            raise ValueError("PDF exceeds extracted text budget")
        parts.append(text)
    clean = clean_text("\n".join(parts))
    return (
        {"description": clean.strip(), "salary_text": extract_salary_from_context(clean, title)}
        if has_description_body(clean)
        else {}
    )


def extract_pdf_job_spec(url: str, title: str) -> dict[str, str | None]:
    """Download a bounded public booklet and run the pure PDF parser."""
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=12, context=get_ssl_context()) as response:
            return parse_pdf_job_spec(response.read(MAX_PDF_BYTES + 1), title)
    except Exception:
        return {}
