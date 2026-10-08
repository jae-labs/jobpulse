"""Company discovery is additive evidence; never invent a vacancy address."""

import pytest

from jobpulse_scraper.pipeline.employer_offices import DETAILS_API, PLACES_API, discover_offices, website_domain


class Provider:
    def __init__(self, features=None, regions=None, website="https://example.invalid"):
        self.calls = []
        self.regions = (
            regions
            if regions is not None
            else [{"place_id": "city-id", "result_type": "city", "rank": {"confidence": 1}}]
        )
        self.features = features if features is not None else [office()]
        self.website = website

    def get(self, url, params):
        self.calls.append((url, params))
        if url == PLACES_API:
            assert params["filter"] == "place:city-id"
            return {"features": self.features}
        if url == DETAILS_API:
            return {"features": [{"properties": {"website": self.website}}]}
        return {"results": self.regions}


def office(**changes):
    return {
        "properties": {
            "name": "Example Ltd",
            "place_id": "office-id",
            "lat": 0,
            "lon": 0,
            "street": "Synthetic Street",
            "housenumber": "1",
            "formatted": "1 Synthetic Street, Dublin",
            "city": "Dublin",
            "country_code": "ie",
            "categories": ["office.it"],
            **changes,
        }
    }


EMPLOYER = {"employer_id": 1, "name": "Example Ltd", "location": "Dublin", "website": "https://example.invalid"}


def test_company_place_keeps_provenance_address_domain_and_zero_coordinates():
    result = discover_offices(Provider(), EMPLOYER, "secret")
    assert result["status"] == "found"
    assert result["offices"][0]["website_domain"] == "example.invalid"
    assert result["offices"][0]["latitude"] == 0
    assert result["location"] == "Dublin"  # original vacancy place remains unchanged
    assert "secret" not in str(result)


@pytest.mark.parametrize(
    "changes",
    [{"name": "Example Other"}, {"street": None}, {"housenumber": None}, {"lat": True}, {"lon": float("inf")}],
)
def test_partial_names_and_incomplete_addresses_are_unresolved(changes):
    assert discover_offices(Provider([office(**changes)]), EMPLOYER, "secret")["status"] == "unresolved"


def test_conflicting_website_is_not_same_company():
    assert discover_offices(Provider(website="https://another.invalid"), EMPLOYER, "secret")["status"] == "unresolved"


def test_multiple_offices_are_retained_without_selecting_a_workplace():
    result = discover_offices(Provider([office(), office(place_id="second", housenumber="2")]), EMPLOYER, "secret")
    assert len(result["offices"]) == 2
    assert "latitude" not in result


def test_ambiguous_city_stops_before_business_search():
    provider = Provider(regions=[{"rank": {"confidence": 1}}, {"rank": {"confidence": 1}}])
    assert discover_offices(provider, EMPLOYER, "secret")["status"] == "ambiguous"
    assert len(provider.calls) == 1


def test_remote_and_placeholder_do_not_call_provider():
    provider = Provider()
    assert discover_offices(provider, {**EMPLOYER, "location": "Remote"}, "secret")["status"] == "remote"
    assert discover_offices(provider, {**EMPLOYER, "name": "Confidential"}, "secret")["status"] == "unresolved"
    assert not provider.calls


@pytest.mark.parametrize(
    "value", ["https://[", "https://127.0.0.1", "javascript:alert(1)", "https://u:p@example.invalid", None]
)
def test_unsafe_website_is_not_stored(value):
    assert website_domain(value) is None


def test_office_stage_failure_does_not_fail_scrape_or_location_verification(monkeypatch):
    from jobpulse_scraper.pipeline import runner

    monkeypatch.setenv("GEOAPIFY_API_KEY", "synthetic")
    monkeypatch.setattr(runner, "_scrape", lambda *args: {"added": 3})
    monkeypatch.setattr(
        "jobpulse_scraper.pipeline.employer_offices.enrich_offices",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError()),
    )
    monkeypatch.setattr(
        "jobpulse_scraper.pipeline.job_locations.verify_catalog_locations", lambda **kwargs: {"updated": 2}
    )
    result = runner.synchronize()
    assert result == {"added": 3, "employer_offices": {"failed": 1}, "locations": {"updated": 2}}


@pytest.mark.parametrize(
    "features", [[None], [{"properties": None}], [office(name=None)], [office(categories="office.it")]]
)
def test_malformed_provider_results_are_retryable(features):
    from jobpulse_scraper.pipeline.company_research import ResearchError

    with pytest.raises(ResearchError):
        discover_offices(Provider(features), EMPLOYER, "secret")


class OfficeQuery:
    def __init__(self, client, table):
        self.client, self.table = client, table
        self.cursor, self.start, self.end = 0, 0, 99
        self.filters = {}

    def select(self, fields):
        return self

    def order(self, field):
        return self

    def gt(self, field, value):
        self.cursor = value
        return self

    def limit(self, value):
        assert value <= 100
        return self

    def in_(self, field, values):
        assert len(values) <= 100
        self.filters[field] = values
        return self

    def range(self, start, end):
        assert end - start + 1 <= 100
        self.start, self.end = start, end
        return self

    def execute(self):
        from types import SimpleNamespace

        if self.table == "jobs":
            rows = [r for r in self.client.jobs if r["id"] > self.cursor][:100]
        else:
            rows = [
                r for r in self.client.lookups if all(r[field] in values for field, values in self.filters.items())
            ][self.start : self.end + 1]
        return SimpleNamespace(data=rows)


class OfficeClient:
    def __init__(self, jobs, lookups=()):
        self.jobs, self.lookups, self.saved = jobs, lookups, []

    def table(self, table):
        assert table in {"jobs", "employer_office_lookups"}
        return OfficeQuery(self, table)

    def rpc(self, name, params):
        from types import SimpleNamespace

        assert name == "save_employer_office_lookup"
        self.saved.append(params["p_record"])
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=True))


def office_jobs(count):
    return [
        {"id": i, "location": "Dublin", "employers": {"id": i, "name": f"Synthetic {i}", "website": None}}
        for i in range(1, count + 1)
    ]


@pytest.mark.parametrize("apply", [False, True])
def test_office_total_budget_pages_distinct_pairs_in_preview_and_apply(monkeypatch, tmp_path, apply):
    from jobpulse_scraper.pipeline import employer_offices as module

    jobs = office_jobs(250)
    jobs[100]["employers"] = jobs[0]["employers"]  # repeated pair across page boundary
    client = OfficeClient(jobs)
    monkeypatch.setenv("GEOAPIFY_API_KEY", "synthetic")
    monkeypatch.setattr(module, "get_supabase", lambda: client)
    monkeypatch.setattr(
        module, "discover_offices", lambda provider, row, key: {**row, "status": "unresolved", "offices": []}
    )
    report = tmp_path / "offices.json"
    counts = module.enrich_offices(apply=apply, limit=205, report=report)
    import json

    records = json.loads(report.read_text())["records"]
    assert counts["checked"] == 205
    assert len({(r["employer_id"], r["location"]) for r in records}) == 205
    assert len(client.saved) == (205 if apply else 0)
    assert {r["employer_id"] for r in records} == set(range(1, 207)) - {101}


def test_office_eligibility_retains_refresh_and_name_changes():
    from typing import cast

    from supabase import Client

    from jobpulse_scraper.pipeline.employer_offices import pending_office_rows

    lookups = [
        {"employer_id": 1, "location": "Dublin", "employer_name": "Synthetic 1", "retry_after": "2999-01-01T00:00:00Z"},
        {"employer_id": 2, "location": "Dublin", "employer_name": "Renamed", "retry_after": "2999-01-01T00:00:00Z"},
        {"employer_id": 3, "location": "Dublin", "employer_name": "Synthetic 3", "retry_after": "2000-01-01T00:00:00Z"},
    ]
    assert [r["employer_id"] for r in pending_office_rows(cast(Client, OfficeClient(office_jobs(4), lookups)))] == [
        2,
        3,
        4,
    ]


def test_office_provider_failure_budget_stops_without_advancing_all_pairs(monkeypatch):
    from jobpulse_scraper.pipeline import employer_offices as module
    from jobpulse_scraper.pipeline.company_research import ResearchError

    client = OfficeClient(office_jobs(200))
    monkeypatch.setenv("GEOAPIFY_API_KEY", "synthetic")
    monkeypatch.setattr(module, "get_supabase", lambda: client)
    monkeypatch.setattr(module, "discover_offices", lambda *args: (_ for _ in ()).throw(ResearchError("synthetic")))
    counts = module.enrich_offices(apply=True, limit=10000, concurrency=1)
    assert counts["checked"] == counts["provider_failed"] == len(client.saved) == 5


def test_office_large_budget_stops_when_catalog_is_exhausted(monkeypatch):
    from jobpulse_scraper.pipeline import employer_offices as module

    monkeypatch.setenv("GEOAPIFY_API_KEY", "synthetic")
    monkeypatch.setattr(module, "get_supabase", lambda: OfficeClient(office_jobs(3)))
    monkeypatch.setattr(
        module, "discover_offices", lambda provider, row, key: {**row, "status": "remote", "offices": []}
    )
    assert module.enrich_offices(limit=10000)["checked"] == 3


def test_office_pool_has_bounded_parallelism_and_single_writer(monkeypatch):
    import threading

    from jobpulse_scraper.pipeline import employer_offices as module

    main_thread = threading.get_ident()
    barrier = threading.Barrier(4)
    client = OfficeClient(office_jobs(4))
    original_rpc = client.rpc

    def rpc(name, params):
        assert threading.get_ident() == main_thread
        return original_rpc(name, params)

    def discover(provider, row, key):
        barrier.wait(timeout=3)
        return {**row, "status": "unresolved", "offices": []}

    monkeypatch.setenv("GEOAPIFY_API_KEY", "synthetic")
    monkeypatch.setattr(client, "rpc", rpc)
    monkeypatch.setattr(module, "get_supabase", lambda: client)
    monkeypatch.setattr(module, "discover_offices", discover)
    counts = module.enrich_offices(apply=True, limit=4, concurrency=4)
    assert counts["checked"] == counts["updated"] == len(client.saved) == 4


def test_office_concurrent_failure_stop_drains_only_inflight_work(monkeypatch):
    from jobpulse_scraper.pipeline import employer_offices as module
    from jobpulse_scraper.pipeline.company_research import ResearchError

    client = OfficeClient(office_jobs(100))
    monkeypatch.setenv("GEOAPIFY_API_KEY", "synthetic")
    monkeypatch.setattr(module, "get_supabase", lambda: client)
    monkeypatch.setattr(module, "discover_offices", lambda *args: (_ for _ in ()).throw(ResearchError("synthetic")))
    counts = module.enrich_offices(apply=True, limit=100, concurrency=4)
    assert 5 <= counts["checked"] <= 8
    assert counts["checked"] == counts["provider_failed"] == len(client.saved)
