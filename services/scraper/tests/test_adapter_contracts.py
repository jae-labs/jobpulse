"""Parsers are replayable and adapters receive their transport explicitly."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from jobpulse_scraper.contracts import FetchResponse, SourceTarget
from jobpulse_scraper.scrapers.adapters import ADAPTERS


def test_greenhouse_reads_full_bodies_and_budget_fallback_keeps_identity():
    from email.message import Message
    from urllib.error import HTTPError

    from jobpulse_scraper.contracts import ResponseBudgetExceeded

    target = SourceTarget("greenhouse", "Synthetic", "https://boards.greenhouse.io/synthetic", "synthetic")
    calls = []
    payload = {
        "jobs": [
            {
                "id": 1,
                "title": "Synthetic Engineer",
                "location": {"name": "Dublin, Ireland"},
                "absolute_url": "https://example.invalid/jobs/1",
                "content": "Published responsibilities. " * 10,
            }
        ]
    }

    class Transport:
        def fetch(self, url):
            calls.append(url)
            return FetchResponse(url, 200, json.dumps(payload).encode())

    jobs = ADAPTERS["greenhouse"].crawl(target, Transport())
    assert calls[0].endswith("content=true") and "Published responsibilities" in jobs[0].description
    calls.clear()

    class Oversized(Transport):
        def fetch(self, url):
            if url.endswith("content=true"):
                calls.append(url)
                raise ResponseBudgetExceeded("Synthetic oversized board")
            return super().fetch(url)

    assert ADAPTERS["greenhouse"].crawl(target, Oversized())[0].url == jobs[0].url
    assert len(calls) == 2 and calls[1].endswith("content=false")

    class Denied(Transport):
        def fetch(self, url):
            raise HTTPError(url, 429, "denied", Message(), None)

    with pytest.raises(HTTPError):
        ADAPTERS["greenhouse"].crawl(target, Denied())


@pytest.mark.parametrize(
    "provider,payload",
    [
        (
            "greenhouse",
            {
                "jobs": [
                    {
                        "id": 1,
                        "title": "Engineer",
                        "location": {"name": "Dublin"},
                        "content": "Published engineering responsibilities.",
                    }
                ]
            },
        ),
        (
            "lever",
            [
                {
                    "id": "1",
                    "text": "Engineer",
                    "categories": {"location": "Dublin"},
                    "hostedUrl": "https://example.invalid/jobs/1",
                    "descriptionPlain": "Published engineering responsibilities.",
                }
            ],
        ),
        (
            "ashby",
            {
                "jobs": [
                    {
                        "id": "1",
                        "title": "Engineer",
                        "location": "Dublin",
                        "jobUrl": "https://example.invalid/jobs/1",
                        "descriptionPlain": "Published engineering responsibilities.",
                    }
                ]
            },
        ),
    ],
)
def test_adapter_replays_payload_and_injects_transport(provider, payload):
    target = SourceTarget(provider, "Synthetic Employer", "https://example.invalid", "synthetic")
    response = FetchResponse(target.url, 200, json.dumps(payload).encode())
    requested = []

    class FakeTransport:
        def fetch(self, url):
            requested.append(url)
            return response

    adapter = ADAPTERS[provider]
    jobs = adapter.crawl(target, FakeTransport())
    assert jobs == adapter.parser(target, response)
    assert len(jobs) == 1 and jobs[0].company == target.company
    assert requested == [adapter.request_url(target)]


@pytest.mark.parametrize("payload", [{}, {"jobs": None}, {"jobs": {}}])
def test_malformed_payload_does_not_become_empty_success(payload):
    target = SourceTarget("greenhouse", "Synthetic", "https://example.invalid", "synthetic")
    with pytest.raises(ValueError):
        ADAPTERS["greenhouse"].parser(target, FetchResponse(target.url, 200, json.dumps(payload).encode()))


def test_installed_cli_works_outside_service_directory(tmp_path: Path):
    result = subprocess.run(
        [sys.executable, "-m", "jobpulse_scraper.app", "--validate-config"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "is valid" in result.stdout


@pytest.mark.parametrize("provider,payload", [("bamboohr", {}), ("workable", {}), ("recruitee", {})])
def test_additional_provider_schema_failures_are_not_empty_boards(provider, payload):
    target = SourceTarget(provider, "Synthetic", "https://example.invalid", "synthetic")
    with pytest.raises(ValueError):
        ADAPTERS[provider].parser(target, FetchResponse(target.url, 200, json.dumps(payload).encode()))


def test_runtime_imports_in_fresh_process_without_provider_initialization():
    result = subprocess.run(
        [sys.executable, "-c", "import jobpulse_scraper.runtime.queue; import jobpulse_scraper.scrapers.parsers.ashby"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_pure_parser_modules_do_not_import_acquisition_or_persistence():
    import ast

    from jobpulse_scraper.paths import PACKAGE_ROOT

    for path in (PACKAGE_ROOT / "scrapers" / "parsers").glob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith(
                    ("jobpulse_scraper.network", "jobpulse_scraper.database", "jobpulse_scraper.scrapers.providers")
                ), path.name


def test_workday_post_paginates_without_keyword_omissions_and_filters_foreign_roles():
    from jobpulse_scraper.contracts import FetchRequest

    target = SourceTarget("workday", "Synthetic", "https://synthetic.wd5.myworkdayjobs.com/careers")
    requests = []
    payloads = [
        {
            "jobPostings": [{"title": "Irish Engineer", "locationsText": "Dublin, Ireland", "externalPath": "/job/1"}],
            "total": 2,
        },
        {
            "jobPostings": [
                {"title": "Foreign Engineer", "locationsText": "Berlin, Germany", "externalPath": "/job/2"}
            ],
            "total": 2,
        },
    ]

    class Transport:
        def fetch(self, request):
            assert isinstance(request, FetchRequest) and request.method == "POST"
            assert request.body is not None
            requests.append(json.loads(request.body))
            return FetchResponse(request.url, 200, json.dumps(payloads.pop(0)).encode())

    jobs = ADAPTERS["workday"].crawl(target, Transport())
    assert [job.title for job in jobs] == ["Irish Engineer"]
    assert [(r["searchText"], r["offset"]) for r in requests] == [("", 0), ("", 1)]


def test_workday_selects_published_country_facet_and_preserves_multiple_location_jobs():
    from jobpulse_scraper.contracts import FetchRequest

    target = SourceTarget("workday", "Synthetic", "https://synthetic.wd5.myworkdayjobs.com/en-US/Careers")
    requests = []
    all_country = {
        "facetParameter": "locationCountry",
        "values": [
            {"descriptor": "Ireland", "id": "published-irish-id", "count": 1},
            {"descriptor": "United States", "id": "published-us-id", "count": 999},
        ],
    }
    responses = [
        {
            "total": 1000,
            "facets": [all_country],
            "jobPostings": [
                {"title": "Foreign Engineer", "locationsText": "USA-Remote", "externalPath": "/job/foreign"}
            ],
        },
        {
            "total": 1,
            "facets": [{"facetParameter": "locationCountry", "values": all_country["values"][:1]}],
            "jobPostings": [
                {"title": "Synthetic Engineer", "locationsText": "2 Locations", "externalPath": "/job/irish"}
            ],
        },
    ]

    class Transport:
        def fetch(self, spec):
            assert isinstance(spec, FetchRequest) and spec.body is not None
            requests.append(json.loads(spec.body))
            return FetchResponse(spec.url, 200, json.dumps(responses.pop(0)).encode())

    jobs = ADAPTERS["workday"].crawl(target, Transport())
    assert len(jobs) == 1 and jobs[0].location == "Ireland"
    assert jobs[0].as_record()["location_evidence"] == "workday_irish_facet"
    assert requests[1]["appliedFacets"] == {"locationCountry": ["published-irish-id"]}
    assert requests[1]["searchText"] == "" and requests[1]["offset"] == 0


def test_workday_does_not_invent_country_or_overwrite_explicit_foreign_location():
    from jobpulse_scraper.scrapers.parsers.workday import parse_workday_payload

    url = "https://synthetic.wd5.myworkdayjobs.com/Careers"
    payload = {"total": 1, "jobPostings": [{"title": "Synthetic Engineer", "externalPath": "/job/1"}]}
    assert parse_workday_payload("Synthetic", url, payload) == []
    payload["jobPostings"][0]["locationsText"] = "Berlin, Germany"
    payload["facets"] = [{"facetParameter": "locationCountry", "values": [{"id": "irish", "descriptor": "Ireland"}]}]
    assert parse_workday_payload("Synthetic", url, payload) == []


@pytest.mark.parametrize(
    "path", ["/Careers", "/en-US/Careers", "/Careers/job/Dublin/1", "/wday/cxs/synthetic/Careers/jobs"]
)
def test_workday_board_identity_is_not_confused_with_locale_or_detail_path(path):
    from jobpulse_scraper.scrapers.requests import workday_request

    target = SourceTarget("workday", "Synthetic", "https://synthetic.wd5.myworkdayjobs.com" + path)
    assert workday_request(target).url == "https://synthetic.wd5.myworkdayjobs.com/wday/cxs/synthetic/Careers/jobs"


def test_ukg_post_pages_return_requests_not_parsed_records():
    from jobpulse_scraper.contracts import FetchRequest

    target = SourceTarget(
        "ukg", "Synthetic", "https://synthetic.invalid/tenant/JobBoard/11111111-1111-1111-1111-111111111111"
    )
    requests = []

    class Transport:
        def fetch(self, request):
            assert isinstance(request, FetchRequest)
            assert request.body is not None
            requests.append(json.loads(request.body)["opportunitySearch"]["Skip"])
            payload = {"opportunities": [{}] if len(requests) == 1 else [], "totalCount": 101}
            return FetchResponse(request.url, 200, json.dumps(payload).encode())

    assert ADAPTERS["ukg"].crawl(target, Transport()) == []
    assert requests == [0, 100]


def test_smartrecruiters_uses_ireland_filter_and_preserves_it_across_pages():
    from jobpulse_scraper.scrapers.adapters import next_page, request_url

    target = SourceTarget("smartrecruiters", "Synthetic", "https://careers.smartrecruiters.com/synthetic", "synthetic")
    assert request_url(target) == (
        "https://api.smartrecruiters.com/v1/companies/synthetic/postings?limit=100&offset=0&country=ie"
    )
    response = FetchResponse(
        "https://api.smartrecruiters.com/v1/companies/synthetic/postings?limit=100&offset=2&country=ie",
        200,
        json.dumps({"content": [{}], "totalFound": 4}).encode(),
    )
    assert str(next_page(target, response, 1)).endswith("limit=100&offset=3&country=ie")


def test_ashby_encoded_space_board_identity_is_supported_without_path_injection():
    from jobpulse_scraper.config.boards import detect_provider
    from jobpulse_scraper.scrapers.adapters import request_url

    url = "https://jobs.ashbyhq.com/Protex%20AI"
    provider, identifier = detect_provider(url)
    assert (provider, identifier) == ("ashby", "Protex%20AI")
    target = SourceTarget(provider, "Protex AI", url, identifier)
    assert request_url(target) == "https://api.ashbyhq.com/posting-api/job-board/Protex%20AI"
    unsafe = SourceTarget("ashby", "Synthetic", "https://jobs.ashbyhq.com/foo%2Fbar", "foo%2Fbar")
    with pytest.raises(ValueError, match="Invalid ATS board identity"):
        request_url(unsafe)


def test_hubspot_recovery_keeps_native_job_identity_and_never_bypasses_denial():
    from email.message import Message
    from urllib.error import HTTPError

    target = SourceTarget(
        "hubspot", "Synthetic", "https://www.hubspot.com/careers/jobs", "www.hubspot.com/careers/jobs"
    )
    requests = []

    class RecoveringTransport:
        def fetch(self, url):
            requests.append(url)
            payload = (
                {"errors": [{"message": "upstream unavailable"}], "data": {"jobs": None}}
                if len(requests) == 1
                else {"jobs": [{"id": 1, "title": "Engineer", "location": {"name": "Dublin, Ireland"}}]}
            )
            return FetchResponse(url.url if hasattr(url, "url") else url, 200, json.dumps(payload).encode())

    jobs = ADAPTERS["hubspot"].crawl(target, RecoveringTransport())
    assert len(requests) == 2 and jobs[0].url == "https://www.hubspot.com/careers/jobs/1"

    class DeniedTransport:
        def fetch(self, url):
            requests.append(url)
            raise HTTPError(target.url, 403, "denied", Message(), None)

    before = len(requests)
    with pytest.raises(HTTPError):
        ADAPTERS["hubspot"].crawl(target, DeniedTransport())
    assert len(requests) == before + 1


def test_rezoomo_contract_lists_and_country_codes_are_normalized():
    target = SourceTarget("rezoomo", "Synthetic", "https://www.rezoomo.com/company/synthetic/jobs/")
    rows = [
        {
            "id": 1,
            "name": "Engineer",
            "location": "Dublin, Ireland",
            "type": ["fulltime", "contract"],
            "isPublished": True,
        },
        {"id": 2, "name": "Foreign", "location": "UK", "type": ["perm"], "isPublished": True},
        {"id": 3, "name": "Unspecified", "type": ["perm"], "isPublished": True},
    ]
    jobs = ADAPTERS["rezoomo"].parser(
        target, FetchResponse(target.url, 200, json.dumps({"data": {"companyJobs": rows}}).encode())
    )
    assert len(jobs) == 1 and jobs[0].employment_type == "Full-Time, Contract"
    assert jobs[0].description == "" and jobs[0].location == "Dublin, Ireland"


def test_rezoomo_tenant_subdomain_uses_direct_company_listing_request():
    from jobpulse_scraper.config.boards import board_url, detect_provider
    from jobpulse_scraper.scrapers.parsers.rezoomo import rezoomo_company_slug
    from jobpulse_scraper.scrapers.requests import rezoomo_request

    target = SourceTarget("rezoomo", "Applegreen", "https://applegreen-stores.rezoomo.com/")
    assert rezoomo_company_slug(target.url) == "applegreen-stores"
    request = rezoomo_request(target)
    assert request.method == "POST"
    assert b"applegreen-stores" in (request.body or b"")
    assert detect_provider(target.url) == ("rezoomo", "applegreen-stores")
    assert board_url("rezoomo", "applegreen-stores") == "https://www.rezoomo.com/company/applegreen-stores/"
    assert rezoomo_company_slug("https://www.rezoomo.com/") is None
    assert rezoomo_company_slug("https://applegreen-stores.rezoomo.com.evil.invalid/") is None


@pytest.mark.parametrize(
    "provider,url",
    [("amazon", "https://www.amazon.jobs/en/search?base_query=Ireland"), ("lidl", "https://jobs.lidl.ie/")],
)
def test_token_free_sources_do_not_require_board_slug(provider, url):
    from jobpulse_scraper.scrapers.adapters import request_url

    assert isinstance(request_url(SourceTarget(provider, "Synthetic", url, url)), str)
