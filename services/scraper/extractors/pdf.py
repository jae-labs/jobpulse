"""Candidate information booklet and job spec PDF text extractor."""

from __future__ import annotations

from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen


def extract_pdf_job_spec(url: str, title: str) -> dict[str, str]:
    """Download and extract job specification text from a candidate information booklet PDF."""
    try:
        import fitz  # PyMuPDF

        req = Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
        with urlopen(req, timeout=12, context=get_ssl_context()) as resp:
            data = resp.read()
            if not data or len(data) < 500:
                return {}
            doc = fitz.open(stream=data, filetype="pdf")
            full_text = ""
            for i, page in enumerate(doc):
                if i >= 15:  # Read up to first 15 pages
                    break
                full_text += page.get_text() + "\n"

            clean = clean_text(full_text)
            if len(clean) > 200:
                sal = extract_salary_from_context(clean, title)
                return {
                    "description": clean[:25000].strip(),
                    "salary_text": sal,
                }
    except Exception:
        pass
    return {}
