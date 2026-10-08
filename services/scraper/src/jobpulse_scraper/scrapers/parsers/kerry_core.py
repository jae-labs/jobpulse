"""Pure supplied-source parsing for kerry acquisition workflows."""

from __future__ import annotations

import re


def extract_kerry_job_details(text: str) -> dict[str, str]:
    """Parse text from Kerry job posting page."""
    location = re.search(r"Location:\s*\n(.+)", text)
    employment_type = re.search(r"\n(FT Permanent|FT Fixed Term|\(US\)Full Time)\n", text)
    description = re.search(r"\nDescription\s*\n(.*?)(?:\nWhy join us\?|\nApply now)", text, flags=re.DOTALL)
    return {
        "location": location.group(1).strip() if location else "Ireland",
        "employment_type": employment_type.group(1).strip() if employment_type else "See job post",
        "description": description.group(1).strip() if description else "",
    }
