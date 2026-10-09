import json
from datetime import UTC, datetime

import pytest

from jobpulse_scraper.contracts import FetchResponse
from jobpulse_scraper.network.posting_transport import public_address
from jobpulse_scraper.pipeline.job_availability import Probe, parse_availability, verify_availability

URL = "https://careers.example.invalid/jobs/12345"
JOB = Probe(id=1, title="Synthetic Engineer", url=URL)
NOW = datetime(2026, 10, 9, tzinfo=UTC)


def response(posting=None, *, status=200, url=URL, extra=""):
    posting = {"@type": "JobPosting", "title": JOB.title, "url": URL, **(posting or {})}
    body = '<script type="application/ld+json">' + json.dumps(posting) + "</script>" + extra
    return FetchResponse(url, status, body.encode(), "text/html")


def test_matching_published_role_is_active():
    assert parse_availability(JOB, response(), NOW).state == "active"


@pytest.mark.parametrize("posting", [{"title": "Other role"}, {"url": URL + "/other"}, {"validThrough": "invalid"}])
def test_unrelated_or_invalid_evidence_is_uncertain(posting):
    assert parse_availability(JOB, response(posting), NOW).state == "unverified"


def test_published_expiry_is_closure_and_date_is_inclusive():
    assert parse_availability(JOB, response({"validThrough": "2026-10-08"}), NOW).state == "closed"
    assert parse_availability(JOB, response({"validThrough": "2026-10-09"}), NOW).state == "active"


@pytest.mark.parametrize("status", [301, 403, 404, 429, 500])
def test_http_failure_never_confirms_closure(status):
    assert parse_availability(JOB, response(status=status), NOW).state == "unverified"


def test_redirected_success_cannot_confirm_another_posting():
    assert parse_availability(JOB, response(url=URL + "/different"), NOW).state == "unverified"


def test_generic_page_or_malformed_json_is_uncertain():
    for html in ["<main>Welcome to careers</main>", '<script type="application/ld+json">{</script>']:
        assert parse_availability(JOB, FetchResponse(URL, 200, html.encode(), "text/html"), NOW).state == "unverified"


@pytest.mark.parametrize(
    "url", ["file:///etc/passwd", "http://user:password@example.com/jobs/123", "https://example.com:8443/jobs/123"]
)
def test_unsafe_urls_rejected_before_dns(url):
    with pytest.raises(ValueError):
        public_address(url)


def test_mixed_public_private_dns_is_rejected(monkeypatch):
    monkeypatch.setattr(
        "socket.getaddrinfo", lambda *a: [(2, 1, 6, "", ("8.8.8.8", 443)), (2, 1, 6, "", ("127.0.0.1", 443))]
    )
    with pytest.raises(ValueError):
        public_address(URL)


@pytest.mark.parametrize("limit,concurrency", [(0, 2), (51, 2), (10, 0), (10, 5)])
def test_bounds_rejected_before_database_access(limit, concurrency):
    with pytest.raises(ValueError):
        verify_availability(limit=limit, concurrency=concurrency)


def test_closure_is_scoped_to_the_matching_posting():
    assert parse_availability(JOB, response({"description": "This job is no longer available"}), NOW).state == "closed"
    assert (
        parse_availability(
            JOB, response(extra='<div class="job-description">Other job is no longer available</div>'), NOW
        ).state
        == "unverified"
    )
    page = '<h1>Other role</h1><aside>Synthetic Engineer</aside><div class="job-description">This job is no longer available</div>'
    assert parse_availability(JOB, FetchResponse(URL, 200, page.encode(), "text/html"), NOW).state == "unverified"


def test_bounded_verification_preserves_preview_and_guards_apply(monkeypatch):
    import threading
    import time
    from types import SimpleNamespace

    from jobpulse_scraper.pipeline import job_availability as module

    rows = [{"id": n, "title": JOB.title, "url": URL} for n in range(1, 7)]
    writes = []
    active = maximum = 0
    lock = threading.Lock()

    class Client:
        def table(self, name):
            assert name == "jobs"
            return self

        def select(self, fields):
            assert fields == "id,title,url"
            return self

        def neq(self, *args):
            return self

        def or_(self, *args):
            return self

        def order(self, *args, **kwargs):
            return self

        def limit(self, n):
            return self

        def execute(self):
            return SimpleNamespace(data=rows)

        def rpc(self, name, args):
            assert name == "record_job_availability"
            assert args["p_expected_url"] == URL and args["p_expected_title"] == JOB.title
            writes.append(args)
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=True))

    class Slot:
        def __init__(self, timeout, **kwargs):
            assert timeout == 20

        def execute(self, job):
            nonlocal active, maximum
            with lock:
                active += 1
                maximum = max(maximum, active)
            time.sleep(0.01)
            with lock:
                active -= 1
            if job.id == 6:
                return {"error_code": "task_deadline_exceeded"}
            return {"state": "active", "evidence": "published_detail"}

        def close(self):
            pass

    monkeypatch.setattr(module, "get_supabase", lambda: Client())
    monkeypatch.setattr(module, "TaskProcess", Slot)
    preview = module.verify_availability(limit=6, concurrency=2)
    assert preview["checked"] == 6 and preview["active"] == 5 and preview["unverified"] == 1
    assert not writes and maximum == 2
    applied = module.verify_availability(apply=True, limit=6, concurrency=2)
    assert applied["updated"] == 6 and len(writes) == 6
    timeout_write = next(write for write in writes if write["p_job_id"] == 6)
    assert timeout_write["p_status"] == "unverified" and timeout_write["p_evidence"] == "deadline_exceeded"


def test_transport_refuses_redirects_and_caps_body(monkeypatch):
    from types import SimpleNamespace

    from jobpulse_scraper.contracts import ResponseBudgetExceeded
    from jobpulse_scraper.network import posting_transport as transport

    observations = []
    replies = []

    class Response:
        status = 301

        def getheader(self, key):
            return {"Location": "http://127.0.0.1/private", "Content-Type": "text/html"}.get(key)

        def read1(self, size):
            return b"x" * size

    reply = Response()

    class Connection:
        def __init__(self, host, port, **kwargs):
            self.port = port

        def request(self, *args, **kwargs):
            replies.append(args)

        def getresponse(self):
            return reply

        def close(self):
            pass

    monkeypatch.setattr(transport, "public_address", lambda url: "8.8.8.8")
    monkeypatch.setattr(transport.http.client, "HTTPConnection", Connection)
    monkeypatch.setattr(transport.socket, "create_connection", lambda *args, **kwargs: object())
    monkeypatch.setattr(transport, "event", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        transport,
        "gate",
        SimpleNamespace(
            reserve_delay=lambda url: 0,
            check=lambda url: None,
            observe=lambda *args, **kwargs: observations.append(args),
        ),
    )
    result = transport.PostingTransport().fetch("http://example.invalid/jobs/123")
    assert result.status == 301 and result.body == b"" and len(replies) == 1
    reply.status = 200
    with pytest.raises(ResponseBudgetExceeded):
        transport.PostingTransport().fetch("http://example.invalid/jobs/123")
    assert len(observations) == 2


def unavailable_worker(connection):
    import os

    if os.name == "posix":
        os.setsid()
    connection.recv()
    os._exit(9)


def test_verification_process_crash_is_uncertainty_and_resources_close():
    from jobpulse_scraper.runtime.process_execution import TaskProcess

    process = TaskProcess(5, entrypoint=unavailable_worker)
    try:
        assert process.execute(JOB)["error_code"] == "task_process_failed"
    finally:
        process.close()
    assert process.connection is None and process.process is None
