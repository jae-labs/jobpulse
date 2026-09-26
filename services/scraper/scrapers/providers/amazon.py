"""Amazon Jobs JSON API adapter (Amazon Ireland, AWS)."""

from __future__ import annotations

import json
from typing import Any
from urllib.request import Request

from engine.salary import extract_salary_from_context
from engine.text_cleaner import clean_text
from network.http_client import get_ssl_context
from network.http_client import open_request as urlopen


def extract_amazon_opportunities(employer_name: str, listing_url: str) -> list[dict[str, Any]]:
    """Extract vacancies from Amazon Jobs API."""
    opportunities: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    if "amazon.jobs" not in listing_url:
        return opportunities

    try:
        if "/search.json" in listing_url:
            api_url = listing_url
            if "result_limit=" not in api_url:
                api_url += ("&" if "?" in api_url else "?") + "result_limit=100"
        elif "business_category" in listing_url or "aws" in employer_name.lower():
            api_url = "https://www.amazon.jobs/en/search.json?business_category[]=amazon-web-services&country=IRL&result_limit=100"
        else:
            api_url = "https://www.amazon.jobs/en/search.json?country=IRL&result_limit=100"

        amz_req = Request(api_url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        with urlopen(amz_req, timeout=10, context=get_ssl_context()) as r:
            amz_data = json.loads(r.read().decode())
            for j in amz_data.get("jobs", []):
                title = j.get("title", "").strip()
                loc = j.get("city") or j.get("normalized_location") or "Dublin, Ireland"
                job_path = j.get("job_path") or ""
                job_url = (
                    f"https://www.amazon.jobs{job_path}" if job_path.startswith("/") else (j.get("url_next_step") or "")
                )
                desc = clean_text(j.get("description", ""))
                if not desc:
                    desc = f"{employer_name} position: {title}. Location: {loc}."
                salary = extract_salary_from_context(desc, title)
                if title and job_url and job_url not in seen_urls:
                    seen_urls.add(job_url)
                    opportunities.append(
                        {
                            "title": title,
                            "company": employer_name,
                            "location": loc,
                            "employment_type": j.get("job_schedule_type") or "See job post",
                            "salary_text": salary,
                            "description": desc[:500],
                            "url": job_url,
                            "source": employer_name,
                        }
                    )
    except Exception:
        pass

    return opportunities
