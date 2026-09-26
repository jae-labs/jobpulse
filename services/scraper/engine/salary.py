"""Salary scale parsing and context extraction."""

from __future__ import annotations

import re


def extract_salary_from_context(context_text: str, title: str = "") -> str | None:
    """Extract advertised salary range from context text. Returns None if unadvertised."""
    full_text = f"{title} {context_text}"
    m_range = re.search(
        r"([€£$]\s*\d{1,3}(?:,\d{3})*(?:\s*[kK])?\s*(?:-|–|to)\s*[€£$]?\s*\d{1,3}(?:,\d{3})*(?:\s*[kK])?(?:\s*(?:per\s+annum|p\.a\.|pa|\/year|\/yr))?)",
        full_text,
        re.IGNORECASE,
    )
    if m_range:
        sal = re.sub(r"\s+", " ", m_range.group(1)).strip()
        digits = re.sub(r"[^\d]", "", sal)
        if digits and (int(digits[:2]) >= 20 or len(digits) >= 5 or "k" in sal.lower()):
            return sal

    m_single = re.search(
        r"(?:salary|remuneration|pay|compensation)[:\s]*([€£$]\s*\d{1,3}(?:,\d{3})+(?:\s*(?:per\s+annum|p\.a\.|pa|\/year|\/yr))?)",
        full_text,
        re.IGNORECASE,
    )
    if m_single:
        return re.sub(r"\s+", " ", m_single.group(1)).strip()

    return None
