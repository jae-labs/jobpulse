"""Candidate information booklet and job spec PDF text extractor."""

from __future__ import annotations

from io import BytesIO
from urllib.request import Request

from engine.description_quality import has_description_body
from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen


def extract_pdf_job_spec(url: str, title: str) -> dict[str, str | None]:
    """Download and extract job specification text from a candidate information booklet PDF."""
    try:
        from pypdf import PdfReader

        req = Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
        with urlopen(req, timeout=12, context=get_ssl_context()) as resp:
            data = resp.read()
            if not data or len(data) < 500:
                return {}
            doc = PdfReader(BytesIO(data))
            full_text = "\n".join(page.extract_text() or "" for page in doc.pages)

            clean = clean_text(full_text)
            if has_description_body(clean):
                sal = extract_salary_from_context(clean, title)
                return {
                    "description": clean.strip(),
                    "salary_text": sal,
                }
    except Exception:
        pass
    return {}
