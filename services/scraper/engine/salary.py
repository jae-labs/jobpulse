"""Extract advertised salary text; numeric normalization belongs to Postgres."""

from __future__ import annotations

import re

_AMOUNT = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*[kK]?"
_PERIOD = r"(?:\s*(?:(?:per|a)\s+(?:annum|year|month|week|day|hour)|p\.a\.|pa\b|/(?:year|yr|month|mo|week|day|hour|hr)|(?:annually|annual|monthly|weekly|daily|hourly)\b))?"
_RANGE = re.compile(rf"[€£$]\s*{_AMOUNT}\s*(?:-|–|to)\s*[€£$]?\s*{_AMOUNT}{_PERIOD}", re.IGNORECASE)
_SINGLE = re.compile(rf"(?:salary|remuneration|pay|compensation)[:\s]*([€£$]\s*{_AMOUNT}{_PERIOD})", re.IGNORECASE)


def extract_salary_from_context(context_text: str, title: str = "") -> str | None:
    """Preserve currency, decimal amounts and pay period from source text."""
    full_text = f"{title} {context_text}"
    match = _RANGE.search(full_text)
    if match:
        return re.sub(r"\s+", " ", match.group()).strip()
    match = _SINGLE.search(full_text)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip()
    return None
