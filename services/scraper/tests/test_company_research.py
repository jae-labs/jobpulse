"""External identity and geolocation failures cannot become verified company facts."""

import json
from typing import cast

import httpx
import pytest
from supabase import Client

from pipeline.company_research import ResearchClient, ResearchError


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
    monkeypatch.setattr("pipeline.company_research.time.sleep", lambda seconds: None)

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
