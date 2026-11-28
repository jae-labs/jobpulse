"""External identity and geolocation failures cannot become verified company facts."""

import json
from typing import cast

import httpx
import pytest
from supabase import Client

from jobpulse_scraper.pipeline.company_research import ResearchClient, ResearchError


def client(tmp_path, handler):
    return ResearchClient(tmp_path, httpx.Client(transport=httpx.MockTransport(handler)))


def test_ambiguous_company_is_not_picked(tmp_path):
    researcher = client(
        tmp_path,
        lambda request: httpx.Response(
            200, json={"search": [{"id": "Q1", "label": "Example Ltd"}, {"id": "Q2", "label": "Example"}]}
        ),
    )
    assert researcher.company("Example Ltd")["outcome"] == "ambiguous"


def test_partial_name_is_not_accepted(tmp_path):
    researcher = client(
        tmp_path, lambda request: httpx.Response(200, json={"search": [{"id": "Q1", "label": "Example Worldwide"}]})
    )
    assert researcher.company("Example")["outcome"] == "not_found"


@pytest.mark.parametrize(
    "kind,lat,lon", [("city", 0, 0), ("building", True, 0), ("building", 91, 0), ("building", 0, float("inf"))]
)
def test_imprecise_or_invalid_geocoding_rejected(tmp_path, kind, lat, lon):
    researcher = client(
        tmp_path,
        lambda request: httpx.Response(
            200, content=json.dumps({"results": [{"result_type": kind, "lat": lat, "lon": lon}]})
        ),
    )
    assert researcher.geocode("Documented address", "secret")["outcome"] == "insufficient_precision"


def test_geocoding_cached_without_key_and_stays_reviewable(tmp_path):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"results": [{"result_type": "building", "lat": 0, "lon": 0}]})

    researcher = client(tmp_path, handler)
    assert researcher.geocode("Documented address", "first-secret")["outcome"] == "needs_review"
    assert researcher.geocode("Documented address", "second-secret")["latitude"] == 0
    assert len(calls) == 1
    assert "secret" not in json.dumps([p.read_text() for p in tmp_path.iterdir()])


def test_provider_failure_does_not_cache_or_leak_credentials(tmp_path):
    researcher = client(tmp_path, lambda request: httpx.Response(403))
    with pytest.raises(ResearchError, match="HTTP 403") as error:
        researcher.geocode("Address", "secret-value")
    assert "secret-value" not in str(error.value)
    assert list(tmp_path.iterdir()) == []


def test_api_error_not_cached(tmp_path):
    researcher = client(tmp_path, lambda request: httpx.Response(200, json={"error": {"code": "maxlag"}}))
    with pytest.raises(ResearchError):
        researcher.company("Example")
    assert list(tmp_path.iterdir()) == []


def test_exact_entity_supplies_company_not_headquarters_centroid(tmp_path, monkeypatch):
    monkeypatch.setattr("jobpulse_scraper.pipeline.company_research.time.sleep", lambda seconds: None)

    def handler(request):
        if request.url.path == "/w/api.php":
            assert request.url.params["search"] == "example"
            return httpx.Response(200, json={"search": [{"id": "Q1", "label": "Example"}]})
        if "Q2" in request.url.path:
            return httpx.Response(200, json={"entities": {"Q2": {"labels": {"en": {"value": "Synthetic industry"}}}}})
        return httpx.Response(
            200,
            json={
                "entities": {
                    "Q1": {
                        "claims": {
                            "P452": [{"mainsnak": {"datavalue": {"value": {"id": "Q2"}}}}],
                            "P6375": [
                                {"mainsnak": {"datavalue": {"value": {"text": "1 Example Road", "language": "en"}}}}
                            ],
                            "P856": [{"mainsnak": {"datavalue": {"value": "https://example.invalid"}}}],
                            "P159": [{"mainsnak": {"datavalue": {"value": {"id": "Q3"}}}}],
                        },
                        "descriptions": {"en": {"value": "Synthetic company"}},
                    }
                }
            },
        )

    result = client(tmp_path, handler).company("Example Ltd")
    assert result["outcome"] == "needs_review"
    assert result["sector_candidates"] == ["Synthetic industry"]
    assert result["address_candidates"] == ["1 Example Road"]
    assert result["website_candidates"] == ["https://example.invalid"]
    assert result["latitude"] is None and result["longitude"] is None


def test_catalog_pages_and_combines_both_sources_without_private_reads(monkeypatch):
    from types import SimpleNamespace

    from tools import research_employers

    class Query:
        def __init__(self, table):
            self.table, self.cursor, self.ids = table, None, []

        def select(self, columns):
            assert columns in {"id,employer_id,source", "id,name,metadata_source"}
            return self

        def in_(self, field, values):
            if field == "id":
                self.ids = values
            else:
                assert field == "source" and set(values) == {"JobsIreland.ie"}
            return self

        def order(self, field):
            assert field == "id"
            return self

        def limit(self, size):
            assert size == 500
            return self

        def gt(self, field, cursor):
            assert field == "id"
            self.cursor = cursor
            return self

        def execute(self):
            if self.table == "jobs":
                rows = [{"id": i, "employer_id": 1, "source": "JobsIreland.ie"} for i in range(1, 501)]
                return SimpleNamespace(data=[r for r in rows if self.cursor is None or r["id"] > self.cursor][:500])
            return SimpleNamespace(
                data=[{"id": i, "name": "Example", "metadata_source": "unverified"} for i in self.ids]
            )

    class Catalog:
        def table(self, name):
            assert name in {"employers", "jobs"}
            return Query(name)

    monkeypatch.setattr(research_employers, "retry_supabase", lambda operation: operation())
    result = research_employers.catalog_employers(cast(Client, Catalog()), ["JobsIreland.ie"])
    assert len(result) == 1
    assert result[1]["job_count"] == 500
    assert set(result[1]["job_sources"]) == {"JobsIreland.ie"}


@pytest.mark.parametrize(
    "endpoint", ["https://api.geoapify.com/v2/places", "https://api.geoapify.com/v2/place-details"]
)
def test_office_endpoints_share_existing_provider_budget(tmp_path, endpoint):
    researcher = client(tmp_path / "office-cache", lambda request: httpx.Response(200, json={"features": []}))
    researcher.get(endpoint, {"apiKey": "synthetic-secret"})
    budgets = list(tmp_path.glob("geoapify-budget-*.txt"))
    assert len(budgets) == 1 and budgets[0].read_text() == "1"
    researcher.get(endpoint, {"apiKey": "another-secret"})
    assert budgets[0].read_text() == "1"  # cached requests spend no additional allowance


def test_concurrent_identical_requests_share_one_response_and_hide_keys(tmp_path, capsys):
    import time
    from concurrent.futures import ThreadPoolExecutor

    calls = []

    def handler(request):
        calls.append(request)
        time.sleep(0.05)
        return httpx.Response(200, json={"features": []})

    first = client(tmp_path / "office-cache", handler)
    second = client(tmp_path / "office-cache", handler)
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(first.get, "https://api.geoapify.com/v2/places", {"apiKey": "first-private-key"})
        b = pool.submit(second.get, "https://api.geoapify.com/v2/places", {"apiKey": "second-private-key"})
        assert a.result() == b.result() == {"features": []}
    assert len(calls) == 1
    assert first.metrics()["requests"] + second.metrics()["requests"] == 1
    assert first.metrics()["cache_hits"] + second.metrics()["cache_hits"] == 1
    output = capsys.readouterr().err
    assert "private-key" not in output
    assert "response_received" in output and "cache_hit" in output
    assert all(isinstance(json.loads(line), dict) for line in output.splitlines())


def test_distinct_concurrent_requests_overlap_but_share_one_second_pacing(tmp_path):
    import threading
    import time
    from concurrent.futures import ThreadPoolExecutor

    barrier = threading.Barrier(2)
    starts = []

    def handler(request):
        starts.append(time.monotonic())
        barrier.wait(timeout=5)
        return httpx.Response(200, json={"features": []})

    researchers = [client(tmp_path / "office-cache", handler) for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(r.get, "https://api.geoapify.com/v2/places", {"name": str(i), "apiKey": "secret"})
            for i, r in enumerate(researchers)
        ]
        assert all(f.result() == {"features": []} for f in futures)
    assert 0.9 <= abs(starts[1] - starts[0]) < 4


@pytest.mark.parametrize("retry_after", ["120", "Wed, 01 Jan 2999 00:00:00 GMT"])
def test_rate_limit_cooldown_is_shared_and_long_delays_fail_fast(tmp_path, retry_after):
    import time

    first = client(tmp_path / "office-cache", lambda request: httpx.Response(429, headers={"Retry-After": retry_after}))
    second = client(tmp_path / "office-cache", lambda request: pytest.fail("Cooldown must prevent network calls"))
    started = time.monotonic()
    with pytest.raises(ResearchError, match="cooling down"):
        first.get("https://api.geoapify.com/v2/places", {"name": "first", "apiKey": "secret"})
    with pytest.raises(ResearchError, match="cooling down"):
        second.get("https://api.geoapify.com/v2/places", {"name": "second", "apiKey": "secret"})
    assert time.monotonic() - started < 2
    assert first.metrics()["rate_limits"] == 1
    assert second.metrics()["requests"] == 0
    assert not list((tmp_path / "office-cache").glob("*.json"))


def test_interrupted_rate_state_publication_keeps_existing_cooldown(tmp_path, monkeypatch):
    from pathlib import Path

    researcher = client(tmp_path / "office-cache", lambda request: pytest.fail("No provider call expected"))
    state = tmp_path / "geoapify-transport.json"
    existing = {"cooldown_until": 9999999999}
    state.write_text(json.dumps(existing))
    original = Path.replace

    def interrupted(path, target):
        if target == state:
            raise OSError("Synthetic interrupted publication")
        return original(path, target)

    monkeypatch.setattr(Path, "replace", interrupted)
    with pytest.raises(OSError):
        researcher._geoapify_gate(120)
    assert json.loads(state.read_text()) == existing


def test_provider_cooldown_is_visible_to_another_process(tmp_path):
    import subprocess
    import sys

    researcher = client(tmp_path / "office-cache", lambda request: pytest.fail("No provider call expected"))
    researcher._geoapify_gate(120)
    script = f"""
from pathlib import Path
import httpx
from jobpulse_scraper.pipeline.company_research import ResearchClient, ResearchError
researcher = ResearchClient(Path({str(tmp_path / "office-cache")!r}), httpx.Client())
try:
    researcher._geoapify_gate()
except ResearchError:
    print("cooldown-blocked")
else:
    raise AssertionError("Another process must observe the cooldown")
"""
    result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "cooldown-blocked"
