"""Already-linked employer enrichment is finite, read-only by default and guarded."""

import json
from types import SimpleNamespace

import pytest

from jobpulse_scraper.pipeline import employer_lookup
from tools import enrich_employers as enrichment


class Query:
    def __init__(self, client):
        self.client = client
        self.cursor = None
        self.size = 500
        self.filters = []
        self.payload = None

    def select(self, fields):
        assert fields == "id,name,metadata_source"
        return self

    def order(self, field):
        assert field == "id"
        return self

    def limit(self, size):
        self.size = size
        return self

    def gt(self, field, cursor):
        assert field == "id"
        self.cursor = cursor
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def in_(self, field, values):
        self.filters.append((field, values))
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def execute(self):
        if self.payload is not None:
            self.client.writes.append((self.payload, self.filters))
            if self.client.outcome == "failed":
                raise RuntimeError("Synthetic write failure")
            return SimpleNamespace(data=[] if self.client.outcome == "conflict" else [{"id": 501}])
        rows = [
            r
            for r in self.client.rows
            if (self.cursor is None or r["id"] > self.cursor)
            and all(
                r.get(field, "unverified") in value if isinstance(value, list) else r.get(field, "unverified") == value
                for field, value in self.filters
            )
        ]
        return SimpleNamespace(data=rows[: self.size])


class Client:
    def __init__(self, rows, outcome="updated"):
        self.rows = rows
        self.outcome = outcome
        self.writes = []

    def table(self, name):
        assert name == "employers"  # No job, candidate, vector or scoring writes.
        return Query(self)


def setup(monkeypatch, client):
    monkeypatch.setattr(enrichment, "get_supabase", lambda: client)
    monkeypatch.setattr(enrichment, "retry_supabase", lambda fn: fn())
    monkeypatch.setattr(
        enrichment,
        "curated_employer",
        lambda name: (
            {
                "sector": "Synthetic industry",
                "location": None,
                "latitude": None,
                "longitude": None,
                "description": "Synthetic employer services.",
                "website": "https://example.invalid",
                "sources": ["https://example.invalid/about"],
            }
            if name == "Example Alias Ltd"
            else None
        ),
    )


def test_full_unknown_page_does_not_stop_scan_or_write_in_preview(monkeypatch, tmp_path):
    client = Client([{"id": i, "name": "Unknown"} for i in range(500)] + [{"id": 501, "name": "Example Alias Ltd"}])
    setup(monkeypatch, client)
    report = tmp_path / "report.csv"
    counts = enrichment.run_enrichment(report=report)
    assert counts == {"scanned": 501, "proposed": 1, "updated": 0, "unresolved": 500, "conflicts": 0, "failed": 0}
    assert not client.writes
    assert "https://example.invalid/about" in report.read_text()
    assert enrichment.run_enrichment(limit=3)["scanned"] == 3
    with pytest.raises(ValueError):
        enrichment.run_enrichment(limit=0)


@pytest.mark.parametrize("outcome", ["updated", "conflict", "failed"])
def test_updates_actual_alias_id_and_reports_concurrent_changes_and_failures(monkeypatch, outcome):
    client = Client([{"id": 501, "name": "Example Alias Ltd"}], outcome)
    setup(monkeypatch, client)
    counts = enrichment.run_enrichment(dry_run=False)
    assert counts[{"updated": "updated", "conflict": "conflicts", "failed": "failed"}[outcome]] == 1
    payload, guards = client.writes[0]
    assert guards == [("id", 501), ("name", "Example Alias Ltd"), ("metadata_source", "unverified")]
    assert payload["metadata_source"] == "curated"
    assert payload["latitude"] is None and payload["longitude"] is None
    assert "name" not in payload  # Linked employer identity is preserved.


def test_evidence_requires_full_alias_and_does_not_invent_coordinates(monkeypatch):
    record = {"name": "Example", "sector": "Synthetic industry", "latitude": None, "longitude": None}
    monkeypatch.setattr(employer_lookup, "EVIDENCED_EMPLOYERS", {"example alias ltd": record})
    monkeypatch.setattr(employer_lookup, "CURATED_IRISH_EMPLOYERS", {})
    assert employer_lookup.curated_employer("  EXAMPLE  Alias Ltd ") == record
    assert employer_lookup.curated_employer("Example Alias Ltd UK") is None
    assert employer_lookup.curated_employer("Unknown Example Alias Ltd") is None
    assert employer_lookup.curated_employer("JobsIreland Employer") is None


def test_feed_placeholder_is_never_an_employer_or_sector():
    assert employer_lookup.curated_employer("JobsIreland Employer") is None
    service = employer_lookup.EmployerLookupService(client=object())
    assert service.resolve_employer("JobsIreland Employer") is None


def test_evidence_resolves_named_employers_without_platform_sector_guesses():
    curated = employer_lookup.curated_employer("Fenergocareers")
    assert curated is not None
    assert curated["name"] == "Fenergo"
    curated = employer_lookup.curated_employer("henryschein")
    assert curated is not None
    assert curated["sector"] == "Healthcare Distribution & Technology"
    curated = employer_lookup.curated_employer("Infosys")
    assert curated is not None
    assert curated["sector"] == "IT Services and Consulting"
    for platform in ("SmartRecruiters, Inc.", "Lever, Inc.", "Zohorecruit", "HireHive", "ACCA Careers"):
        assert employer_lookup.curated_employer(platform) is None
    assert employer_lookup.curated_employer("Fenergocareers UK") is None
    for record in employer_lookup.EVIDENCED_EMPLOYERS.values():
        assert record["sources"] and all(url.startswith("https://") for url in record["sources"])
        assert record["checked_on"] and record["website"].startswith("https://")
        if record["latitude"] is not None or record["longitude"] is not None:
            assert record["coordinate_sources"]
            assert all(url in record["sources"] for url in record["coordinate_sources"])


@pytest.mark.parametrize(
    "coordinates",
    [
        {"latitude": 1},
        {"latitude": 91, "longitude": 2},
        {"latitude": True, "longitude": 2},
        {"latitude": 1, "longitude": 2},
        {"latitude": 1, "longitude": 2, "coordinate_sources": ["https://other.invalid"]},
    ],
)
def test_registry_rejects_unwitnessed_or_invalid_coordinates(tmp_path, coordinates):
    path = tmp_path / "evidence.json"
    record = {
        "name": "Example",
        "aliases": ["Example"],
        "sector": "Synthetic industry",
        "checked_on": "2026-10-02",
        "sources": ["https://example.invalid/locations"],
        "location": "Example office",
        **coordinates,
    }
    path.write_text(json.dumps([record]))
    with pytest.raises(ValueError, match="coordinates require"):
        employer_lookup.load_evidence_registry(path)
    record.update(latitude=0, longitude=0, coordinate_sources=record["sources"])
    path.write_text(json.dumps([record]))
    assert employer_lookup.load_evidence_registry(path)["example"]["latitude"] == 0


def test_refresh_verified_requires_registry_and_guards_current_source(monkeypatch):
    client = Client(
        [
            {"id": 1, "name": "Example Alias Ltd", "metadata_source": "verified"},
            {"id": 2, "name": "Example Alias Ltd", "metadata_source": "curated"},
            {"id": 3, "name": "Example Alias Ltd", "metadata_source": "watchlist"},
        ]
    )
    setup(monkeypatch, client)
    assert enrichment.run_enrichment()["proposed"] == 0
    assert enrichment.run_enrichment(refresh_verified=True)["proposed"] == 1
    assert not client.writes
    assert enrichment.run_enrichment(refresh_verified=True, dry_run=False)["updated"] == 1
    assert client.writes[0][1] == [("id", 1), ("name", "Example Alias Ltd"), ("metadata_source", "verified")]
    with pytest.raises(ValueError, match="reviewed external registry"):
        enrichment.run_enrichment(database_only=True, refresh_verified=True)
