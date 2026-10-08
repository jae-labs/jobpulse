"""Provider registry shared by workers, parser replay and execution pilots."""

import json
from typing import Any
from urllib.parse import parse_qs, urlsplit

from jobpulse_scraper.contracts import FetchRequest, FetchResponse, RawJob, SourceAdapter, SourceTarget
from jobpulse_scraper.scrapers.parsers.amazon import parse_amazon_payload
from jobpulse_scraper.scrapers.parsers.ashby import parse_ashby_payload
from jobpulse_scraper.scrapers.parsers.bamboohr import parse_bamboohr_payload
from jobpulse_scraper.scrapers.parsers.breezy import parse_breezy_payload
from jobpulse_scraper.scrapers.parsers.core_pages import parse_housing_agency_page, parse_kildare_page
from jobpulse_scraper.scrapers.parsers.greenhouse import parse_greenhouse_payload
from jobpulse_scraper.scrapers.parsers.hubspot import parse_hubspot_payload
from jobpulse_scraper.scrapers.parsers.ida import parse_ida_page
from jobpulse_scraper.scrapers.parsers.jsonld import extract_jsonld_opportunities
from jobpulse_scraper.scrapers.parsers.lever import parse_lever_payload
from jobpulse_scraper.scrapers.parsers.lidl import parse_lidl_payload
from jobpulse_scraper.scrapers.parsers.manatal import parse_manatal_payload
from jobpulse_scraper.scrapers.parsers.personio import parse_personio_xml
from jobpulse_scraper.scrapers.parsers.pinpoint import parse_pinpoint_payload
from jobpulse_scraper.scrapers.parsers.recruitee import parse_recruitee_payload
from jobpulse_scraper.scrapers.parsers.rezoomo import parse_rezoomo_payload
from jobpulse_scraper.scrapers.parsers.rippling import parse_rippling_payload
from jobpulse_scraper.scrapers.parsers.smartrecruiters import parse_smartrecruiters_payload
from jobpulse_scraper.scrapers.parsers.ukg import parse_ukg_payload
from jobpulse_scraper.scrapers.parsers.workable import parse_workable_payload
from jobpulse_scraper.scrapers.parsers.workday import parse_workday_payload
from jobpulse_scraper.scrapers.requests import hubspot_request, rezoomo_request, ukg_request, workday_request


def _token(target: SourceTarget) -> str:
    token = target.identifier or urlsplit(target.url).path.strip("/").split("/")[0]
    if not token or any(
        character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-" for character in token
    ):
        raise ValueError("Invalid ATS board identity")
    return token


def _records(target: SourceTarget, response: FetchResponse) -> list[dict[str, Any]]:
    if response.status != 200:
        raise ValueError(f"Unusable listing HTTP {response.status}")
    if target.provider == "ida":
        return parse_ida_page(response.body.decode(), response.url)
    if target.provider == "housing_agency":
        return parse_housing_agency_page(response.body.decode())
    if target.provider == "kildare":
        return parse_kildare_page(response.body.decode())
    if target.provider == "jsonld":
        return extract_jsonld_opportunities(target.company, response.url, response.body.decode(), set())
    if target.provider == "personio":
        import re

        match = re.search(r"https?://([a-zA-Z0-9_-]+)\.jobs\.personio\.(de|com)", target.url)
        if not match:
            raise ValueError("Invalid Personio board")
        return parse_personio_xml(target.company, match.group(1), match.group(2), response.body)
    payload = json.loads(response.body)
    if target.provider == "ukg":
        request = ukg_request(target)
        return parse_ukg_payload(target.company, request.url.split("/JobBoardView/", 1)[0], payload)
    if target.provider == "workday":
        return parse_workday_payload(target.company, target.url, payload)
    if target.provider == "hubspot":
        return parse_hubspot_payload(target.company, target.url, payload)
    if target.provider == "rezoomo":
        import re

        match = re.search(r"rezoomo\.com/company/([a-zA-Z0-9_-]+)", target.url)
        if not match:
            raise ValueError("Invalid Rezoomo board")
        return parse_rezoomo_payload(target.company, match.group(1), payload)
    parsers = {
        "manatal": parse_manatal_payload,
        "greenhouse": parse_greenhouse_payload,
        "lever": parse_lever_payload,
        "ashby": parse_ashby_payload,
        "smartrecruiters": parse_smartrecruiters_payload,
        "rippling": parse_rippling_payload,
        "pinpoint": parse_pinpoint_payload,
        "breezy": parse_breezy_payload,
        "amazon": parse_amazon_payload,
        "lidl": parse_lidl_payload,
        "bamboohr": parse_bamboohr_payload,
        "workable": parse_workable_payload,
        "recruitee": parse_recruitee_payload,
    }
    identifier = target.url if target.provider in {"amazon", "lidl"} else _token(target)
    return parsers[target.provider](target.company, identifier, payload)


def parse(target: SourceTarget, response: FetchResponse) -> list[RawJob]:
    return [RawJob.model_validate(record) for record in _records(target, response)]


def request_url(target: SourceTarget) -> str | FetchRequest:
    if target.provider in {"workday", "hubspot", "rezoomo", "ukg"}:
        return {"workday": workday_request, "hubspot": hubspot_request, "rezoomo": rezoomo_request, "ukg": ukg_request}[
            target.provider
        ](target)
    if target.provider in {"jsonld", "housing_agency", "kildare", "ida"}:
        return target.url
    if target.provider == "personio":
        return target.url.split("/job/", 1)[0].rstrip("/") + "/xml?language=en"
    if target.provider == "amazon":
        if "/search.json" in target.url:
            return (
                target.url
                if "result_limit=" in target.url
                else target.url + ("&" if "?" in target.url else "?") + "result_limit=100"
            )
        if "business_category" in target.url or "aws" in target.company.lower():
            return "https://www.amazon.jobs/en/search.json?business_category[]=amazon-web-services&country=IRL&result_limit=100"
    if target.provider == "amazon":
        return "https://www.amazon.jobs/en/search.json?country=IRL&result_limit=100"
    if target.provider == "lidl":
        return "https://jobs.lidl.ie/api/v1/search"
    token = _token(target)
    return {
        "manatal": f"https://open.api.manatal.com/open/v3/career-page/{token}/jobs/",
        "greenhouse": f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=false",
        "lever": f"https://api.lever.co/v0/postings/{token}?mode=json",
        "ashby": f"https://api.ashbyhq.com/posting-api/job-board/{token}",
        "smartrecruiters": f"https://api.smartrecruiters.com/v1/companies/{token}/postings?limit=100&offset=0",
        "rippling": f"https://ats.rippling.com/api/v2/board/{token}/jobs?page=0&pageSize=50",
        "pinpoint": f"https://{token}.pinpointhq.com/postings.json",
        "breezy": f"https://{token}.breezy.hr/json",
        "amazon": "https://www.amazon.jobs/en/search.json?country=IRL&result_limit=100",
        "lidl": "https://jobs.lidl.ie/api/v1/search",
        "bamboohr": f"https://{token}.bamboohr.com/careers/list",
        "workable": f"https://apply.workable.com/api/v1/widget/accounts/{token}?details=true",
        "recruitee": f"https://{token}.recruitee.com/api/offers/",
    }[target.provider]


ADAPTERS = {
    provider: SourceAdapter(parse, request_url)
    for provider in (
        "greenhouse",
        "lever",
        "ashby",
        "jsonld",
        "bamboohr",
        "workable",
        "recruitee",
        "pinpoint",
        "breezy",
        "amazon",
        "lidl",
    )
}


def next_page(target: SourceTarget, response: FetchResponse, page: int) -> str | FetchRequest | None:
    payload = json.loads(response.body)
    if target.provider == "workday":
        request_body = (
            json.loads(response.request.body)
            if response.request and response.request.body
            else {"offset": page * 20, "searchText": "Ireland"}
        )
        search_text = request_body["searchText"]
        if not payload["jobPostings"] and search_text == "Ireland":
            return workday_request(target, 0, "")
        offset = request_body["offset"] + len(payload["jobPostings"])
        if not payload["jobPostings"] or offset >= payload["total"]:
            return None
        return workday_request(target, offset, search_text)
    if target.provider == "ukg":
        offset = (page + 1) * 100
        total = payload.get("totalCount")
        return (
            ukg_request(target, offset)
            if payload["opportunities"] and isinstance(total, int) and offset < total
            else None
        )
    if target.provider == "manatal":
        following = payload.get("next")
        if following and (
            urlsplit(following).scheme != "https" or urlsplit(following).netloc != "open.api.manatal.com"
        ):
            raise ValueError("Manatal pagination must stay on its public API origin")
        return following
    token = _token(target) if target.provider in {"smartrecruiters", "rippling"} else ""
    if target.provider == "smartrecruiters":
        rows = payload["content"]
        offset = int(parse_qs(urlsplit(response.url).query).get("offset", ["0"])[0]) + len(rows)
        if not rows or offset >= payload.get("totalFound", offset):
            return None
        return f"https://api.smartrecruiters.com/v1/companies/{token}/postings?limit=100&offset={offset}"
    if target.provider == "rippling":
        rows = payload["items"]
        total = payload.get("totalPages")
        if not rows or (isinstance(total, int) and page + 1 >= total) or (total is None and len(rows) < 50):
            return None
        return f"https://ats.rippling.com/api/v2/board/{token}/jobs?page={page + 1}&pageSize=50"
    if target.provider == "amazon":
        rows = payload["jobs"]
        offset = (page + 1) * 100
        total = payload.get("hits")
        if not rows or (isinstance(total, int) and offset >= total) or (total is None and len(rows) < 100):
            return None
        base_url = request_url(target)
        assert isinstance(base_url, str)
        base = base_url.split("&offset=", 1)[0]
        return f"{base}&offset={offset}"
    return None


for _provider, _max_pages in (("smartrecruiters", 20), ("rippling", 10), ("amazon", 20)):
    ADAPTERS[_provider] = SourceAdapter(parse, request_url, next_page, _max_pages)


for _provider in ("housing_agency", "kildare"):
    ADAPTERS[_provider] = SourceAdapter(parse, request_url)

ADAPTERS["ida"] = SourceAdapter(parse, request_url, transport_kind="browser")

ADAPTERS["workday"] = SourceAdapter(parse, request_url, next_page, 16)
for _provider in ("hubspot", "rezoomo"):
    ADAPTERS[_provider] = SourceAdapter(parse, request_url)

ADAPTERS["ukg"] = SourceAdapter(parse, request_url, next_page, 20)
ADAPTERS["manatal"] = SourceAdapter(parse, request_url, next_page, 20)
ADAPTERS["personio"] = SourceAdapter(parse, request_url)


def hubspot_recovery(target: SourceTarget, response: FetchResponse | None, error: Exception) -> str | None:
    from urllib.error import HTTPError

    if isinstance(error, HTTPError):
        if error.code != 404:
            return None
    elif response is not None and isinstance(error, ValueError):
        payload = json.loads(response.body)
        if not isinstance(payload, dict) or not payload.get("errors"):
            return None
    else:
        return None
    return "https://boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs?content=false"


ADAPTERS["hubspot"] = SourceAdapter(parse, request_url, recover=hubspot_recovery)
