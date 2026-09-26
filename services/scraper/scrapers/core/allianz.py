"""Allianz Ireland Phenom People careers portal scraper using Playwright."""

from __future__ import annotations

from typing import Any

from database.repository import save_job, update_employer_status, update_source_status
from network.browser import with_browser

ALLIANZ_CAREERS_URL = "https://careers.allianz.com/ie/en/search-results"


def sync_allianz() -> tuple[int, str]:
    """Scrape vacancies from Allianz Ireland careers portal using Playwright."""

    def extract_roles(page: Any) -> list[dict[str, str]]:
        page.goto(ALLIANZ_CAREERS_URL, wait_until="domcontentloaded", timeout=25000)
        page.wait_for_timeout(2000)

        # 1. Click SHOW JOBS to reveal the full listings & facets
        try:
            page.locator("button:has-text('SHOW JOBS'), a:has-text('SHOW JOBS')").first.click()
            page.wait_for_timeout(2500)
        except Exception:
            pass

        # 2. Filter for Ireland positions
        page.evaluate(
            """() => {
                const el = document.querySelector("[data-ph-at-text='Ireland']") ||
                           document.getElementById("country_phs_Ireland20") ||
                           Array.from(document.querySelectorAll("label")).find(l => l.innerText.includes("Ireland"));
                if (el) el.click();
            }"""
        )
        page.wait_for_timeout(3500)

        # 3. Extract Ireland job cards
        jobs = page.evaluate(
            """() => {
                const items = [];
                const links = Array.from(document.querySelectorAll("a[data-ph-at-id='job-link'], .job-title a, h3 a"));
                const seen = new Set();
                for (const l of links) {
                    const title = l.innerText.trim();
                    const url = l.href;
                    if (title && url && url.includes("/job/") && !seen.has(url)) {
                        seen.add(url);
                        items.push({ title, url });
                    }
                }
                return items;
            }"""
        )
        return jobs

    try:
        opportunities = with_browser(extract_roles)
    except Exception as exc:
        err_msg = f"Allianz Ireland: Playwright browser error ({exc})"
        update_source_status(
            "Allianz Ireland", "Unavailable", str(exc), url=ALLIANZ_CAREERS_URL, mode="official portal"
        )
        update_employer_status("Allianz Ireland", "Unavailable")
        return 0, err_msg

    added = 0
    for v in opportunities:
        title = v["title"]
        if save_job(
            {
                "title": title,
                "company": "Allianz Ireland",
                "location": "Dublin / Ireland",
                "employment_type": "Permanent",
                "description": f"Allianz Ireland career opportunity: {title}. Full details, requirements, and application available on the official Allianz careers portal.",
                "url": v["url"],
                "source": "Allianz Ireland",
            }
        ):
            added += 1

    status_text = "Synced" if opportunities else "Monitored"
    detail_text = f"Read {len(opportunities)} current Allianz Ireland opportunities; added {added} new opportunities."
    update_source_status(
        "Allianz Ireland",
        status=status_text,
        detail=detail_text,
        opportunities_found=len(opportunities),
        url=ALLIANZ_CAREERS_URL,
        mode="official portal",
    )
    update_employer_status(
        "Allianz Ireland",
        status=status_text,
        opportunities_found=len(opportunities),
        discovered_jobs_url=ALLIANZ_CAREERS_URL,
    )

    return added, f"Allianz Ireland: {len(opportunities)} opportunities read; {added} new opportunities added."
