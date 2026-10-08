"""Pure public ATS request construction shared by execution engines."""

import json
import re

from jobpulse_scraper.contracts import FetchRequest, SourceTarget

JSON_HEADERS = (("Content-Type", "application/json"), ("Accept", "application/json"))


def workday_request(target: SourceTarget, offset: int = 0, search_text: str = "Ireland") -> FetchRequest:
    match = re.search(r"https://([^.]+)\.wd(\d+)\.myworkdayjobs\.com/(?:[a-zA-Z-]+/)?([^/?#]+)", target.url)
    if not match:
        raise ValueError("Invalid Workday board")
    tenant, generation, site = match.groups()
    url = f"https://{tenant}.wd{generation}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"
    return FetchRequest(
        url,
        "POST",
        json.dumps({"limit": 20, "offset": offset, "searchText": search_text, "appliedFacets": {}}).encode(),
        JSON_HEADERS,
    )


def hubspot_request(target: SourceTarget) -> FetchRequest:
    query = "query Jobs { jobs { id title department { name } office { id location } location { name } } }"
    return FetchRequest(
        "https://wtcfns.hubspot.com/careers/graphql",
        "POST",
        json.dumps({"operationName": "Jobs", "query": query, "variables": {}}).encode(),
        JSON_HEADERS + (("Origin", "https://www.hubspot.com"), ("Referer", "https://www.hubspot.com/")),
    )


def rezoomo_request(target: SourceTarget) -> FetchRequest:
    match = re.search(r"rezoomo\.com/company/([a-zA-Z0-9_-]+)", target.url)
    if not match:
        raise ValueError("Invalid Rezoomo board")
    boundary = "----JobPulseRezoomoBoundary"
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="action"\r\n\r\napi.front.company.onMount\r\n--{boundary}\r\nContent-Disposition: form-data; name="companyUrl"\r\n\r\n{match.group(1)}\r\n--{boundary}--\r\n'
    ).encode()
    return FetchRequest(
        "https://www.rezoomo.com/index.cfm",
        "POST",
        body,
        (("Content-Type", f"multipart/form-data; boundary={boundary}"),),
    )


def ukg_request(target: SourceTarget, offset: int = 0) -> FetchRequest:
    match = re.search(r"https?://([^/]+)/([^/]+)/JobBoard/([0-9a-fA-F-]{36})", target.url)
    if not match:
        raise ValueError("Invalid UKG board")
    host, tenant, board = match.groups()
    return FetchRequest(
        f"https://{host}/{tenant}/JobBoard/{board}/JobBoardView/LoadSearchResults",
        "POST",
        json.dumps({"opportunitySearch": {"Top": 100, "Skip": offset, "QueryString": "", "OrderBy": []}}).encode(),
        JSON_HEADERS,
    )
