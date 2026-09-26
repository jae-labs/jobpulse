"""IDA Ireland careers and CandidateManager scraper using Playwright."""

from __future__ import annotations

from typing import Any

from database.repository import save_job, update_employer_status, update_source_status
from network.browser import with_browser

IDA_OPEN_ROLES_URL = "https://www.idaireland.com/careers-at-ida-ireland/open-roles"


def sync_ida() -> tuple[int, str]:
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
        err_msg = f"IDA Ireland: Playwright browser error ({exc})"
        update_source_status("IDA Ireland", "Unavailable", str(exc), url=IDA_OPEN_ROLES_URL, mode="official portal")
        update_employer_status("IDA Ireland", "Unavailable")
        return 0, err_msg

    added = 0
    for v in opportunities:
        title = v["title"]
        if save_job(
            {
                "title": title,
                "company": "IDA Ireland",
                "location": "Dublin / Regional Ireland",
                "employment_type": "Permanent",
                "description": f"Official IDA Ireland opportunity: {title}. Review candidate requirements and submit application via the IDA Ireland recruitment portal.",
                "url": v["url"],
                "source": "IDA Ireland",
            }
        ):
            added += 1

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

    return added, f"IDA Ireland: {len(opportunities)} opportunities read; {added} new opportunities added."
