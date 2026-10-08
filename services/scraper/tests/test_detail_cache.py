"""Only confirmed public bodies are reused, under exact identities and bounded freshness."""

from unittest.mock import Mock

from jobpulse_scraper.extractors import jobsireland
from jobpulse_scraper.network import detail_cache

BODY = "Published duties and requirements for this synthetic Irish vacancy. " * 3
URL = "https://jobsireland.ie/en-US/job-Details?id=1"


def test_positive_detail_avoids_duplicate_request_and_expires(monkeypatch):
    clock = [1000000]
    monkeypatch.setattr(detail_cache.time, "time", lambda: clock[0])
    fetch = Mock(return_value=f'<pre ng-bind-html="Description | linky">{BODY}</pre>')
    monkeypatch.setattr(jobsireland, "fetch_page", fetch)
    assert jobsireland.extract_jobsireland_job_spec(URL)["description"] == BODY.strip()
    assert jobsireland.extract_jobsireland_job_spec(URL)["description"] == BODY.strip()
    assert fetch.call_count == 1
    assert detail_cache.cached_body(URL + "0") is None
    clock[0] += detail_cache.FRESH_SECONDS + 1
    assert jobsireland.extract_jobsireland_job_spec(URL)["description"] == BODY.strip()
    assert fetch.call_count == 2


def test_missing_or_mismatched_detail_never_caches(monkeypatch):
    fetch = Mock(
        return_value='<input id="JobReference" value="#JOB-2"><pre ng-bind-html="Description | linky">'
        + BODY
        + "</pre>"
    )
    monkeypatch.setattr(jobsireland, "fetch_page", fetch)
    assert jobsireland.extract_jobsireland_job_spec(URL) == {}
    assert detail_cache.cached_body(URL) is None
    fetch.return_value = "<main>Search jobs</main>"
    assert jobsireland.extract_jobsireland_job_spec(URL) == {}
    assert detail_cache.cached_body(URL) is None


def test_cache_bounds_bodies_and_entries(monkeypatch):
    monkeypatch.setattr(detail_cache, "MAX_ENTRIES", 2)
    detail_cache.remember_body(URL, "x" * (detail_cache.MAX_BODY_BYTES + 1))
    assert detail_cache.cached_body(URL) is None
    for index in range(3):
        detail_cache.remember_body(URL + str(index), BODY)
    with detail_cache.ledger().transaction() as connection:
        assert connection.execute("SELECT count(*) FROM detail_bodies").fetchone()[0] == 2


def test_concise_published_requirement_is_valid_but_placeholder_is_not(monkeypatch):
    monkeypatch.setattr(
        jobsireland,
        "fetch_page",
        lambda _: '<pre ng-bind-html="Description | linky">Previous experience required.</pre>',
    )
    assert jobsireland.extract_jobsireland_job_spec(URL)["description"] == "Previous experience required."
    monkeypatch.setattr(jobsireland, "fetch_page", lambda _: '<pre ng-bind-html="Description | linky">N/A</pre>')
    assert jobsireland.extract_jobsireland_job_spec(URL + "2")["description"] == ""
    assert detail_cache.cached_body(URL + "2") is None
