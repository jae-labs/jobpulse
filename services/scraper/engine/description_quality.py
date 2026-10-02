"""Conservative tripwires for listing metadata and blocked detail pages.

Length alone cannot prove completeness: some employers publish short, valid ads.
"""

from __future__ import annotations

import re

from engine.text_cleaner import ERROR_ANTI_BOT_PATTERNS, clean_html_description

_METADATA = re.compile(
    r"JobsIreland Vacancy Reference:|Consult official employer portal|Check the official vacancy post|"
    r"Official Vacancy and Application Details:|^.+? (?:position|opportunity):",
    re.IGNORECASE,
)


def has_description_body(description: str | None, *, minimum_chars: int = 100) -> bool:
    text = clean_html_description(description or "").strip()
    if len(text) < minimum_chars or any(re.search(pattern, text.lower()) for pattern in ERROR_ANTI_BOT_PATTERNS):
        return False
    # Old adapters prepended listing metadata even to real (but truncated) bodies.
    if any(
        marker in text.lower()
        for marker in (
            "position has been filled",
            "job is no longer available",
            "position has expired",
            "job is closed",
            "no longer accepting applications",
        )
    ):
        return False
    if _METADATA.search(text):
        return False
    return True


def needs_description_repair(description: str | None) -> bool:
    # Short content is suspect, not automatically invalid. A detail fetch may confirm it.
    return not has_description_body(description) or len(description or "") <= 500
