"""Rezoomo careers-board listing adapter."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen
from scrapers.providers.location import is_ireland_location


def extract_rezoomo_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Extract vacancies from Rezoomo company job boards."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    rz = re.search(r"rezoomo\.com/company/([a-zA-Z0-9_-]+)", listing_url)
    if not rz:
        return opportunities

    company_slug = rz.group(1)
    try:
        boundary = "----JobPulseRezoomoBoundary"
        post_body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="action"\r\n\r\n'
            f"api.front.company.onMount\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="companyUrl"\r\n\r\n'
            f"{company_slug}\r\n"
            f"--{boundary}--\r\n"
        ).encode()
        rz_req = Request(
            "https://www.rezoomo.com/index.cfm",
            data=post_body,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )
        with urlopen(rz_req, timeout=10, context=get_ssl_context()) as r:
            res = json.loads(r.read().decode())
            for j in res.get("data", {}).get("companyJobs", []):
                title = j.get("name", "").strip()
                job_id = j.get("id")
                loc = j.get("location") or "Ireland"
                if not is_ireland_location(loc):
                    continue
                job_url = f"https://www.rezoomo.com/job/{job_id}/"
                s_from = j.get("salaryFrom")
                s_to = j.get("salaryTo")
                salary = f"€{s_from} – €{s_to}" if s_from and s_to else (f"€{s_from}" if s_from else None)
                desc = j.get("description") or f"{employer_name} position: {title}. Location: {loc}."
                if not salary:
                    salary = extract_salary_from_context(desc, title)
                if title and job_url not in seen_urls:
                    seen_urls.add(job_url)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": j.get("type") or "See job post",
                            "salary_text": salary,
                            "description": clean_text(desc),
                            "url": job_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
