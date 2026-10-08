"""IDA Ireland careers and CandidateManager scraper using Playwright."""

from __future__ import annotations

from typing import Any

from jobpulse_scraper.contracts import SyncReport
from jobpulse_scraper.database.repository import (
    IngestionIncompleteError,
    save_jobs_batch,
    update_employer_status,
    update_source_status,
)
from jobpulse_scraper.network.browser import with_browser

IDA_OPEN_ROLES_URL = "https://www.idaireland.com/careers-at-ida-ireland/open-roles"


def sync_ida() -> SyncReport:
    """Scrape vacancies from IDA Ireland official recruitment portal using Playwright."""

    def extract_roles(page: Any) -> list[dict[str, str]]:
        page.goto(IDA_OPEN_ROLES_URL, wait_until="domcontentloaded", timeout=25000)
        page.wait_for_timeout(3500)

        # Extract job cards where 'View Job' links to the CandidateManager portal
        raw_jobs = page.evaluate(
            """() => {
                const results = [];
                const viewLinks = Array.from(document.querySelectorAll("a")).filter(
                    a => a.innerText.trim().toLowerCase() === "view job" || (a.href && a.href.includes("candidatemanager"))
                );
                for (const a of viewLinks) {
                    let parent = a.parentElement;
                    let title = "";
                    for (let i = 0; i < 5 && parent; i++) {
                        const heading = parent.querySelector("h2, h3, h4, .title, p strong");
                        if (heading && heading.innerText.trim()) {
                            title = heading.innerText.trim();
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    if (title && a.href) {
                        results.push({ title: title, url: a.href });
                    }
                }
                return results;
            }"""
        )
        return raw_jobs

    try:
        opportunities = with_browser(extract_roles)
    except Exception as exc:
        update_source_status(
            "IDA Ireland",
            "Unavailable",
            "Browser listing unavailable; existing vacancies retained.",
            url=IDA_OPEN_ROLES_URL,
            mode="official portal",
        )
        update_employer_status("IDA Ireland", "Unavailable")
        raise IngestionIncompleteError(0, 0, 0) from exc

    jobs_to_save = []
    for v in opportunities:
        title = v["title"]
        jobs_to_save.append(
            {
                "title": title,
                "company": "IDA Ireland",
                "location": "Dublin / Regional Ireland",
                "employment_type": "Permanent",
                "description": f"Official IDA Ireland opportunity: {title}. Review candidate requirements and submit application via the IDA Ireland recruitment portal.",
                "url": v["url"],
                "source": "IDA Ireland",
            }
        )

    added = save_jobs_batch(jobs_to_save, enrich=True)

    status_text = "Synced" if opportunities else "Monitored"
    detail_text = f"Read {len(opportunities)} current IDA Ireland opportunities; added {added} new opportunities."
    update_source_status(
        "IDA Ireland",
        status=status_text,
        detail=detail_text,
        opportunities_found=len(opportunities),
        url=IDA_OPEN_ROLES_URL,
        mode="official portal",
    )
    update_employer_status(
        "IDA Ireland",
        status=status_text,
        opportunities_found=len(opportunities),
        discovered_jobs_url=IDA_OPEN_ROLES_URL,
    )

    return SyncReport(
        added,
        f"IDA Ireland: {len(opportunities)} opportunities read; {added} new opportunities added.",
        found=len(opportunities),
    )
