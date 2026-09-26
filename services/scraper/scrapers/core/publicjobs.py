"""PublicJobs.ie state careers portal scraper."""

from __future__ import annotations

import html
import re
from urllib.parse import urljoin

from config.loader import PUBLICJOBS_URL
from database.repository import save_job, update_source_status
from engine.scoring import evaluate_match
from engine.text_cleaner import clean_text
from network.http_client import fetch_page


def extract_publicjobs_detail(job_url: str, title: str) -> dict[str, str]:
    """Extract department, location, contract, and full role summary from a PublicJobs vacancy page."""
    try:
        jp = fetch_page(job_url)
        if not jp:
            return {}
        no_s = re.sub(
            r"<(?:script|style|nav|header|footer)[^>]*>.*?</(?:script|style|nav|header|footer)>",
            " ",
            jp,
            flags=re.DOTALL | re.IGNORECASE,
        )
        cl = clean_text(no_s)

        dept_m = re.search(
            r"Department/Authority\s+([^\n\r]+?)(?:Department/Authority Website|Working pattern|Advertising Date|County Location|Closing Date|$)",
            cl,
            re.IGNORECASE,
        )
        dept = dept_m.group(1).strip() if dept_m else ""
        if not dept or dept in {".", "-", "Public Sector"} or len(dept) < 2:
            dept = "PublicJobs.ie"

        loc_m = re.search(
            r"County Location\s+([^\n\r]+?)(?:Closing Date|Grade|Contract|$)",
            cl,
            re.IGNORECASE,
        )
        loc = loc_m.group(1).strip() if loc_m else "Ireland"

        type_m = re.search(
            r"Contract\s+([^\n\r]+?)(?:Type of role|Candidate Information Booklet|Find out more|Please note|Accessibility|$)",
            cl,
            re.IGNORECASE,
        )
        raw_type = type_m.group(1).strip() if type_m else "Permanent"
        raw_type_l = raw_type.lower()
        if "permanent" in raw_type_l:
            emp_type = "Permanent"
        elif "fixed term" in raw_type_l:
            emp_type = "Fixed Term"
        elif "specified purpose" in raw_type_l:
            emp_type = "Specified Purpose"
        elif "temporary" in raw_type_l:
            emp_type = "Temporary"
        elif "part" in raw_type_l:
            emp_type = "Part-Time"
        else:
            emp_type = raw_type[:20].strip() if raw_type else "Permanent"

        closing_m = re.search(
            r"Closing Date for Application\s+([^\n\r]+?)(?:Grade|Contract|$)",
            cl,
            re.IGNORECASE,
        )
        closing = closing_m.group(1).strip() if closing_m else ""

        desc_m = re.search(
            r"(?:Job summary|Role summary|About the role|Role description|Summary of role)\s*[:\n]?(.*?)(?:Statement on Accessibility|Statements of Accessibility|Campaign Information|Eligibility|How to Apply|Candidate Information Booklet|\Z)",
            cl,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if desc_m:
            job_summary = desc_m.group(1).strip()
        else:
            job_summary = cl[:25000].strip()

        booklet_m = re.search(r'<a [^>]*href="([^"]+)"[^>]*>[^<]*Information Booklet[^<]*</a>', jp, re.IGNORECASE)
        booklet_url = urljoin(job_url, booklet_m.group(1)) if booklet_m else ""

        full_desc_parts = [
            f"Department / Authority: {dept}",
            f"Contract: {emp_type}" + (f" | Closing Date: {closing}" if closing else ""),
            f"Location: {loc}",
            f"\nRole Summary & Key Responsibilities:\n{job_summary}",
        ]
        if booklet_url:
            full_desc_parts.append(f"\nOfficial Candidate Information Booklet: {booklet_url}")

        return {
            "company": dept if dept != "Public Sector" else "PublicJobs.ie",
            "location": loc,
            "employment_type": emp_type,
            "description": "\n".join(full_desc_parts),
        }
    except Exception:
        return {}


def sync_publicjobs() -> tuple[int, str]:
    """Scrape and evaluate vacancies from PublicJobs.ie."""
    page = fetch_page(PUBLICJOBS_URL)
    pattern = r'<div [^>]*data-title="([^"]+)".*?<a [^>]*href="([^"]*?/candidate/so/pm/[^"]+)"'
    opportunities = list(dict.fromkeys(re.findall(pattern, page, flags=re.IGNORECASE | re.DOTALL)))
    found = 0
    for title, link in opportunities:
        title = html.unescape(re.sub(r"\s+", " ", title)).strip()
        score, _ = evaluate_match(title, "")
        if score == 0:
            continue
        full_url = urljoin(PUBLICJOBS_URL, html.unescape(link))
        detail = extract_publicjobs_detail(full_url, title)
        company = detail.get("company") or "PublicJobs.ie"
        loc = detail.get("location") or "Ireland - see job post"
        emp_type = detail.get("employment_type") or "Permanent / Specified Purpose"
        desc = (
            detail.get("description")
            or f"PublicJobs competition: {title}. See official competition booklet for details."
        )

        if save_job(
            {
                "title": title,
                "company": company,
                "location": loc,
                "employment_type": emp_type,
                "description": desc,
                "url": full_url,
                "source": "PublicJobs.ie",
            }
        ):
            found += 1

    detail_msg = (
        f"Read {len(opportunities)} opportunities; kept {found} relevant opportunities with full specifications."
    )
    update_source_status("PublicJobs.ie", "Synced", detail_msg, opportunities_found=found)
    return found, f"PublicJobs.ie: {found} relevant opportunities added or updated with full specifications."
