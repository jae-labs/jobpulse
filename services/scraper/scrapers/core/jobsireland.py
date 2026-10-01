"""JobsIreland.ie Department of Social Protection (Intreo) careers scraper."""

from __future__ import annotations

import html
import re
import time
from typing import Any
from urllib.parse import urlencode

from config.loader import JOBSIRELAND_API_URL
from database.repository import save_jobs_batch, update_source_status
from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from engine.validators import is_valid_job_title
from network.http_client import fetch_page

CARD_PATTERN = re.compile(
    r'<div class="job-heading[^"]*"\s+data-vacancyid\s*=\s*"(\d+)"[^>]*>(.*?)(?=(?:<div class="job-heading|\Z))',
    re.DOTALL | re.IGNORECASE,
)
LONGLATS_PATTERN = re.compile(r'<ul\s+class="drop"\s+id="longlats"[^>]*>(.*?)</ul>', re.DOTALL | re.IGNORECASE)


def parse_longlats_map(html_content: str) -> dict[str, dict[str, str]]:
    """Parse embedded GPS coordinates and normalized address mapping."""
    geo_map: dict[str, dict[str, str]] = {}
    match = LONGLATS_PATTERN.search(html_content)
    if not match:
        return geo_map

    for li in re.findall(r"<li>(.*?)</li>", match.group(1), re.DOTALL):
        parts = [p.strip() for p in li.split(";")]
        if len(parts) >= 6:
            lat, lon, addr, _title, vid, ref = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            clean_addr = re.sub(r"\s+", " ", addr).strip()
            geo_map[vid] = {"lat": lat, "lon": lon, "address": clean_addr, "ref": ref}
    return geo_map


def extract_jobsireland_cards(html_content: str) -> list[dict[str, Any]]:
    """Extract structured vacancy listings from JobsIreland BrowseJobs HTML payload."""
    opportunities: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    geo_map = parse_longlats_map(html_content)
    matches = CARD_PATTERN.findall(html_content)

    for vid, block in matches:
        if vid in seen_ids:
            continue
        seen_ids.add(vid)

        title_m = re.search(r'id="JobTitle"\s+value="([^"]+)"', block, re.IGNORECASE)
        loc_m = re.search(r'id="Location"\s+value="([^"]+)"', block, re.IGNORECASE)
        ref_m = re.search(r'id="JobReference"\s+value="([^"]+)"', block, re.IGNORECASE)
        start_m = re.search(r'id="StartDate"\s+value="([^"]+)"', block, re.IGNORECASE)
        end_m = re.search(r'id="EndDate"\s+value="([^"]+)"', block, re.IGNORECASE)
        logo_m = re.search(r'alt="(?:Logo of|Default Logo of)\s+([^"]+)"', block, re.IGNORECASE)
        type_m = re.search(r'class="[^"]*button\s+position-[^"]*"[^>]*>([^<]+)</a>', block, re.IGNORECASE)

        raw_title = html.unescape(title_m.group(1)).strip() if title_m else ""
        if not raw_title:
            h3_m = re.search(r"<h3[^>]*>(.*?)</h3>", block, re.DOTALL | re.IGNORECASE)
            raw_title = clean_text(h3_m.group(1)) if h3_m else ""

        title = clean_text(raw_title)
        url = f"https://jobsireland.ie/en-US/job-Details?id={vid}"
        if not is_valid_job_title(title, url):
            continue

        raw_loc = html.unescape(loc_m.group(1)).strip() if loc_m else ""
        geo_info = geo_map.get(vid)
        if not raw_loc and geo_info:
            raw_loc = geo_info.get("address", "")

        loc = clean_text(raw_loc)
        if not loc:
            loc = "Ireland"
        elif "ireland" not in loc.lower():
            loc = f"{loc}, Ireland"

        ref = ref_m.group(1).strip() if ref_m else f"#JOB-{vid}"
        company_raw = html.unescape(logo_m.group(1)).strip() if logo_m else ""
        if (
            not company_raw
            or "confidential" in company_raw.lower()
            or company_raw.lower() in ("jobsirelandavatar.jpg", "default logo")
        ):
            company = "JobsIreland Employer"
        else:
            company = clean_text(company_raw)

        start_date = start_m.group(1).split("T")[0] if start_m else ""
        end_date = end_m.group(1).split("T")[0] if end_m else ""
        emp_type = clean_text(type_m.group(1)).title() if type_m else "Paid Position"

        desc_parts = [
            f"JobsIreland Vacancy Reference: {ref}",
            f"Employer: {company}",
            f"Location: {loc}",
            f"Position Type: {emp_type}",
        ]
        if start_date:
            desc_parts.append(f"Published Date: {start_date}")
        if end_date:
            desc_parts.append(f"Application Closing Date: {end_date}")
        if geo_info and geo_info.get("lat") and geo_info.get("lon"):
            desc_parts.append(f"Coordinates: {geo_info['lat']}, {geo_info['lon']}")
        desc_parts.append(f"\nOfficial Vacancy and Application Details: {url}")

        full_desc = "\n".join(desc_parts)
        salary = extract_salary_from_context(clean_text(block), title)

        opportunities.append(
            {
                "title": title,
                "company": company,
                "location": loc,
                "employment_type": emp_type,
                "salary_text": salary,
                "description": full_desc,
                "url": url,
                "source": "JobsIreland.ie",
            }
        )

    return opportunities


def fetch_jobsireland_page(
    page: int = 1,
    page_size: int = 100,
    vacancy_type_id: int = -1,
    location: str = "",
    keyword: str = "",
) -> tuple[int, list[dict[str, Any]]]:
    """Fetch one paginated window from JobsIreland BrowseJobs endpoint."""
    params = {
        "page": page,
        "pageSize": page_size,
        "VacancyTypeId": vacancy_type_id,
    }
    if location:
        params["location"] = location
    if keyword:
        params["keyWord"] = keyword

    query_str = urlencode(params)
    endpoint = f"{JOBSIRELAND_API_URL}?{query_str}"
    content = fetch_page(endpoint)

    total_m = re.search(r'class="totalCount"\s+value="(\d+)"', content, re.IGNORECASE)
    total_count = int(total_m.group(1)) if total_m else 0

    opportunities = extract_jobsireland_cards(content)
    return total_count, opportunities


def sync_jobsireland(max_pages: int = 100, page_size: int = 100) -> tuple[int, str]:
    """Scrape and ingest active Irish vacancies from JobsIreland.ie."""
    seen_urls: set[str] = set()
    total_reported = 0
    total_read = 0
    total_saved = 0
    effective_max_pages = max_pages

    for page in range(1, max_pages + 1):
        try:
            total_count, page_opps = fetch_jobsireland_page(page=page, page_size=page_size)
            if page == 1:
                total_reported = total_count
                if total_reported > 0:
                    calculated_pages = (total_reported + page_size - 1) // page_size
                    effective_max_pages = min(max_pages, calculated_pages + 1)

            if not page_opps:
                break

            new_opps = []
            for opp in page_opps:
                if opp["url"] not in seen_urls:
                    seen_urls.add(opp["url"])
                    new_opps.append(opp)

            total_read += len(page_opps)
            saved = 0
            if new_opps:
                saved = save_jobs_batch(new_opps, enrich=False)
                total_saved += saved

            print(
                f"  [JOBSIRELAND] Page {page}/{effective_max_pages}: fetched {len(page_opps)}, "
                f"saved {saved} ({total_saved} total saved / {total_reported} in catalog)"
            )

            # Reached end of catalog
            if total_reported > 0 and len(seen_urls) >= total_reported:
                break
            if page >= effective_max_pages:
                break

            time.sleep(0.15)
        except Exception as exc:
            print(f"  [JOBSIRELAND] Page {page} failed: {exc}")
            if page == 1:
                detail_msg = f"Failed to connect to JobsIreland API: {exc}"
                update_source_status("JobsIreland.ie", "Error", detail_msg, opportunities_found=0)
                return 0, detail_msg
            break

    if total_read == 0:
        detail_msg = "JobsIreland sync completed but found 0 active vacancies."
        update_source_status("JobsIreland.ie", "Synced", detail_msg, opportunities_found=0)
        return 0, detail_msg

    detail_msg = (
        f"Read {total_read} vacancies across Ireland (catalog total: {total_reported}); "
        f"persisted {total_saved} opportunities."
    )
    update_source_status("JobsIreland.ie", "Synced", detail_msg, opportunities_found=total_saved)
    return total_saved, f"JobsIreland.ie: {total_saved} opportunities added or refreshed."
