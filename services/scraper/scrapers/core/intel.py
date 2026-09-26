"""Intel Ireland Workday CXS careers scraper."""

from __future__ import annotations

from typing import Any

from config.loader import INTEL_CAREERS_URL, INTEL_JOBS_URL
from database.repository import save_job, update_source_status
from network.browser import with_browser


def extract_intel_ireland_jobs(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Filter Workday job postings for Ireland roles excluding internships/temps."""
    return [
        job
        for job in payload.get("jobPostings", [])
        if "ireland" in job.get("locationsText", "").lower()
        and not any(term in job.get("title", "").lower() for term in ("intern", "temporary", "contract"))
    ]


def intel_ireland_facets(payload: dict[str, Any]) -> dict[str, list[str]]:
    """Derive Workday facet filters for regular workers and Ireland locations."""
    location_ids = []
    regular_id = ""
    for facet in payload.get("facets", []):
        if facet.get("facetParameter") == "workerSubType":
            regular_id = next(
                (value["id"] for value in facet.get("values", []) if value["descriptor"] == "Regular"), ""
            )
        if facet.get("facetParameter") == "locationMainGroup":
            for group in facet.get("values", []):
                for value in group.get("values", []):
                    if "ireland" in value["descriptor"].lower():
                        location_ids.append(value["id"])
    return {"locations": location_ids, "workerSubType": [regular_id] if regular_id else []}


def sync_intel() -> tuple[int, str]:
    """Execute Playwright session to query Intel Workday CXS JSON API."""

    def jobs_request(page: Any, payload: dict[str, Any]) -> dict[str, Any]:
        return page.evaluate(
            """async ({url, payload}) => {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload),
                });
                if (!response.ok) throw new Error(`Intel jobs request failed: ${response.status}`);
                return response.json();
            }""",
            {"url": INTEL_JOBS_URL, "payload": payload},
        )

    def search(page: Any) -> tuple[dict[str, Any], dict[str, Any]]:
        page.goto(INTEL_CAREERS_URL, wait_until="domcontentloaded")
        first = jobs_request(page, {"limit": 20, "offset": 0, "searchText": "", "appliedFacets": {}})
        second = jobs_request(
            page,
            {"limit": 20, "offset": 0, "searchText": "", "appliedFacets": intel_ireland_facets(first)},
        )
        return first, second

    first_page, ireland_page = with_browser(search)
    opportunities = extract_intel_ireland_jobs(ireland_page)
    added = 0
    for job in opportunities:
        title = job["title"]
        if save_job(
            {
                "title": title,
                "company": "Intel Ireland",
                "location": job["locationsText"],
                "employment_type": "See job post",
                "description": f"Intel Ireland vacancy: {title}. {job.get('postedOn', '')} Requisition: {', '.join(job.get('bulletFields', []))}.",
                "url": f"{INTEL_CAREERS_URL}{job['externalPath']}",
                "source": "Intel Ireland",
            }
        ):
            added += 1

    detail_msg = f"Read {len(opportunities)} Ireland/Leixlip opportunities; added {added} new opportunities."
    update_source_status("Intel Ireland", "Synced", detail_msg, opportunities_found=len(opportunities))
    return added, f"Intel Ireland: {len(opportunities)} Ireland/Leixlip opportunities read; {added} new opportunities."
