"""Intel Ireland Workday CXS careers scraper."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.config.loader import INTEL_CAREERS_URL, INTEL_JOBS_URL
from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.repository import save_jobs_batch, update_source_status
from jobpulse_scraper.network.browser import with_browser
from jobpulse_scraper.scrapers.parsers.intel_core import extract_intel_ireland_jobs as extract_intel_ireland_jobs


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


def sync_intel() -> SyncReport:
    """Execute Playwright session to query Intel Workday CXS JSON API."""

    async def jobs_request(page: Any, payload: dict[str, Any]) -> dict[str, Any]:
        return await page.evaluate(
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

    async def search(page: Any) -> tuple[dict[str, Any], dict[str, Any]]:
        await page.goto(INTEL_CAREERS_URL, wait_until="domcontentloaded")
        first = await jobs_request(page, {"limit": 20, "offset": 0, "searchText": "", "appliedFacets": {}})
        second = await jobs_request(
            page,
            {"limit": 20, "offset": 0, "searchText": "", "appliedFacets": intel_ireland_facets(first)},
        )
        return first, second

    first_page, ireland_page = with_browser(search)
    opportunities = extract_intel_ireland_jobs(ireland_page)
    jobs_to_save = []
    for job in opportunities:
        title = job["title"]
        jobs_to_save.append(
            {
                "title": title,
                "company": "Intel Ireland",
                "location": job["locationsText"],
                "employment_type": "See job post",
                "description": f"Intel Ireland vacancy: {title}. {job.get('postedOn', '')} Requisition: {', '.join(job.get('bulletFields', []))}.",
                "url": f"{INTEL_CAREERS_URL}{job['externalPath']}",
                "source": "Intel Ireland",
            }
        )

    added = save_jobs_batch(jobs_to_save, enrich=True)

    detail_msg = f"Read {len(opportunities)} Ireland/Leixlip opportunities; added {added} new opportunities."
    update_source_status("Intel Ireland", "Synced", detail_msg, opportunities_found=len(opportunities))
    return SyncReport(
        added,
        f"Intel Ireland: {len(opportunities)} Ireland/Leixlip opportunities read; {added} new opportunities.",
        found=len(opportunities),
    )
