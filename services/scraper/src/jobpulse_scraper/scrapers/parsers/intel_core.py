"""Pure supplied-source parsing for intel acquisition workflows."""

from __future__ import annotations

from typing import Any


def extract_intel_ireland_jobs(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Filter Workday job postings for Ireland roles excluding internships/temps."""
    return [
        job
        for job in payload.get("jobPostings", [])
        if "ireland" in job.get("locationsText", "").lower()
        and not any(term in job.get("title", "").lower() for term in ("intern", "temporary", "contract"))
    ]
