"""Direct iCIMS listing acquisition preserves country evidence and bounded continuation."""

import pytest

from jobpulse_scraper.contracts import FetchResponse, SourceTarget
from jobpulse_scraper.scrapers.adapters import ADAPTERS

TARGET = SourceTarget("icims", "Synthetic", "https://synthetic.icims.com", "synthetic")


def listing(location: str, job_id: int = 1, next_link: str = "") -> str:
    return (
        '<ul class="iCIMS_JobsTable"><li class="iCIMS_JobCardItem">'
        '<span class="sr-only field-label">Job Locations</span><span>' + location + "</span>"
        f'<a href="https://synthetic.icims.com/jobs/{job_id}/engineer/job?in_iframe=1"><h3>Engineer</h3></a>'
        "</li></ul>" + next_link
    )


def response(body: str) -> FetchResponse:
    return FetchResponse("https://synthetic.icims.com/jobs/search?pr=0", 200, body.encode(), "text/html")


def test_current_location_label_retains_only_published_irish_alternative():
    jobs = ADAPTERS["icims"].parser(TARGET, response(listing("UK-Belfast | IE-Galway")))
    assert len(jobs) == 1
    assert jobs[0].location == "Galway, Ireland"
    assert jobs[0].url == "https://synthetic.icims.com/jobs/1/engineer/job"
    assert ADAPTERS["icims"].parser(TARGET, response(listing("US-Dublin"))) == []
    assert ADAPTERS["icims"].parser(TARGET, response(listing(""))) == []


def test_direct_adapter_continues_after_foreign_only_page():
    requested = []
    bodies = [
        listing("US-Boston", next_link='<link href="/jobs/search?pr=1&amp;in_iframe=1" rel="next">'),
        listing("IE-Cork", 2),
    ]

    class Transport:
        def fetch(self, url):
            requested.append(url)
            return response(bodies[len(requested) - 1])

    jobs = ADAPTERS["icims"].crawl(TARGET, Transport())
    assert len(jobs) == 1
    assert "in_iframe=1" in requested[0]
    assert requested[1] == "https://synthetic.icims.com/jobs/search?pr=1&in_iframe=1"


def test_unverified_empty_and_foreign_pagination_remain_failures():
    with pytest.raises(ValueError, match="verified listing"):
        ADAPTERS["icims"].parser(TARGET, response("<main>Login to continue</main>"))
    assert ADAPTERS["icims"].parser(TARGET, response('<ul class="iCIMS_JobsTable"></ul>')) == []
    with pytest.raises(ValueError, match="public listing origin"):
        assert ADAPTERS["icims"].next_url is not None
        ADAPTERS["icims"].next_url(
            TARGET,
            response(listing("IE-Cork", next_link='<link rel="next" href="https://other.invalid/jobs/search?pr=1">')),
            0,
        )
