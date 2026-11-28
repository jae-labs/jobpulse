"""Published posting bodies from supported APIs, including custom Greenhouse URLs."""

from __future__ import annotations

import json
import re
import time
from functools import lru_cache
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request

from jobpulse_scraper.config.loader import get_employers_tuples
from jobpulse_scraper.engine.text_cleaner import clean_html_description
from jobpulse_scraper.network.http_client import get_ssl_context
from jobpulse_scraper.network.http_client import open_request as urlopen


@lru_cache(maxsize=256)
def _cached_json(url: str, cache_epoch: int) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=10, context=get_ssl_context()) as response:
        return json.loads(response.read())


def _get_json(url: str) -> dict:
    # Share responses for duplicate source aliases without caching stale bodies forever.
    return _cached_json(url, int(time.monotonic() // 300))


def extract_api_job_spec(url: str, company: str) -> dict[str, str]:
    parsed = urlparse(url)
    try:
        if parsed.hostname in {"amazon.jobs", "www.amazon.jobs"}:
            match = re.search(r"/jobs/(\d+)", parsed.path)
            if match:
                job_id = match.group(1)
                data = _get_json(
                    "https://www.amazon.jobs/en/search.json?" + urlencode({"base_query": job_id, "result_limit": 10})
                )
                for job in data.get("jobs", []):
                    if str(job.get("id_icims")) == job_id:
                        return {
                            "description": clean_html_description(
                                "\n\n".join(
                                    job.get(key) or ""
                                    for key in ("description", "basic_qualifications", "preferred_qualifications")
                                )
                            )
                        }
                return {}
        if parsed.hostname and parsed.hostname.endswith(".oraclecloud.com"):
            match = re.search(r"/sites/([^/]+)/(?:requisitions/preview|job)/(\d+)", parsed.path)
            if match:
                site, job_id = match.groups()
                api_url = f"https://{parsed.hostname}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?"
                api_url += urlencode(
                    {"onlyData": "true", "expand": "all", "finder": f'ById;Id="{job_id}",siteNumber={site}'}
                )
                data = _get_json(api_url)
                items = data.get("items", [])
                if len(items) == 1:
                    return {
                        "description": clean_html_description(
                            "\n\n".join(
                                items[0].get(key) or ""
                                for key in (
                                    "ExternalDescriptionStr",
                                    "ExternalResponsibilitiesStr",
                                    "ExternalQualificationsStr",
                                )
                            )
                        )
                    }
                return {}
        greenhouse = re.search(r"(?:job-boards|boards)\.greenhouse\.io/([^/]+)/jobs/(\d+)", url)
        if greenhouse:
            board, job_id = greenhouse.groups()
        else:
            job_id = parse_qs(parsed.query).get("gh_jid", [""])[0]
            board = ""
            # HubSpot's client-rendered directory redirects old detail routes
            # to its index; the current directory identifies this public board.
            if parsed.hostname == "www.hubspot.com":
                hubspot = re.fullmatch(r"/careers/jobs/(\d+)/?", parsed.path)
                if hubspot:
                    board, job_id = "hubspotjobs", hubspot.group(1)
            if job_id.isdigit():
                for employer in get_employers_tuples():
                    if employer[0].casefold() == company.casefold():
                        match = re.search(r"(?:job-boards|boards)\.greenhouse\.io/([^/?#]+)", employer[3])
                        if match:
                            board = match.group(1)
                            break
        if board and job_id:
            data = _get_json(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}")
            if str(data.get("id")) == job_id:
                return {"description": clean_html_description(data.get("content", ""))}
    except Exception:
        return {}
    return {}
