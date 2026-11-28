"""Published detail extraction precedes persistence and retains listing facts on failure."""

import logging
from typing import Any
from urllib.parse import urlsplit

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
            description = spec.get("description") if spec else None
            published_short_body = (
                bool(spec)
                and spec.get("description_origin") == "published_detail"
                and urlsplit(str(job["url"])).hostname == "jobsireland.ie"
                and has_description_body(description, minimum_chars=1)
                and not has_description_body(description)
            )
            if spec and (has_description_body(description) or published_short_body):
                job["description"] = description
                job.pop("description_is_snippet", None)
                if published_short_body:
                    # This flag stays in memory only. The catalog retains the
                    # verified text while the vector worker applies its own
                    # stricter minimum-body policy and clears stale vectors.
                    job["_verified_short_detail"] = True
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
