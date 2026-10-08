"""Published detail extraction precedes persistence and retains listing facts on failure."""

import logging
from typing import Any

from jobpulse_scraper.engine.description_quality import has_description_body, needs_description_repair


def enrich_job(job: dict[str, Any]) -> dict[str, Any]:
    """Enrich a short vacancy description without changing caller-owned data."""
    job = dict(job)

    # Deep Spec Enrichment: if description is a stub or short, fetch full spec from source URL
    raw_desc = job.get("description", "")
    if job.get("url") and (job.get("description_is_snippet") or needs_description_repair(raw_desc)):
        try:
            from jobpulse_scraper.extractors.universal import extract_universal_job_spec

            spec = extract_universal_job_spec(job["url"], job.get("company", ""), job.get("title", ""))
            if spec and has_description_body(spec.get("description")):
                job["description"] = spec["description"]
                if spec.get("salary_text") and not job.get("salary_text"):
                    job["salary_text"] = spec["salary_text"]
                if spec.get("location") and job.get("location") in ("Ireland", "Not specified", ""):
                    job["location"] = spec["location"]
                if spec.get("employment_type") and job.get("employment_type") in ("See job post", "Not specified", ""):
                    job["employment_type"] = spec["employment_type"]
            elif job.get("description_is_snippet"):
                job["description"] = ""
        except Exception:
            if job.get("description_is_snippet"):
                job["description"] = ""
            logging.getLogger(__name__).warning("Job detail extraction failed; existing catalog body will be retained")

    return job
