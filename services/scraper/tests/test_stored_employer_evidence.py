"""Database-only sectors require identity, provenance and unchanged posting evidence."""

import hashlib
import json
from types import SimpleNamespace

import pytest

from pipeline import stored_employer_evidence as evidence
from tools import enrich_employers as enrichment


class Query:
    def __init__(self, client, table):
        self.client, self.table = client, table
        self.filters = []
        self.cursor = None
        self.size = 500
        self.payload = None

    def select(self, fields):
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
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

    def update(self, payload):
        assert self.table == "employers"
        self.payload = payload
        return self

    def execute(self):
        rows = [
            row
            for row in self.client.rows[self.table]
            if all(row.get(field) == value for field, value in self.filters)
            and (self.cursor is None or row["id"] > self.cursor)
        ][: self.size]
        if self.payload:
            self.client.writes.append((self.table, self.payload, self.filters))
            for row in rows:
                row.update(self.payload)
        return SimpleNamespace(data=rows)


class Client:
    def __init__(self, employers, jobs=None):
        self.rows = {"employers": employers, "jobs": jobs or []}
        self.writes = []

    def table(self, name):
        assert name in {"employers", "jobs"}  # Shared catalog only; no private data.
        return Query(self, name)


def test_identity_keeps_geography_business_units_and_literal_short_names():
    assert evidence.company_identity_key("Example Systems, Inc.") == "example systems"
    assert evidence.company_identity_key("Example Systems Ireland Ltd") == "example systems ireland"
    assert evidence.company_identity_key("Example Group Ltd") == "example group"
    assert evidence.company_identity_key("Group Example Ltd") == "group example"
    assert evidence.company_identity_key("ExampleAI") != evidence.company_identity_key("Example")


def test_trusted_index_paginates_without_accepting_legacy_guesses():
    rows = [{"id": i, "name": "Legacy", "sector": "Guessed", "metadata_source": "unverified"} for i in range(500)]
    rows += [{"id": 501, "name": "Example", "sector": "Materials", "metadata_source": "watchlist"}]
    index = evidence.trusted_sector_index(Client(rows))
    assert list(index) == ["example"]
    assert index["example"][0]["id"] == 501


def test_conflicting_or_concurrently_changed_donors_cannot_upgrade_alias():
    rows = [
        {"id": 1, "name": "Example", "sector": "Materials", "metadata_source": "watchlist"},
        {"id": 2, "name": "Example, Inc.", "sector": "Finance", "metadata_source": "verified"},
    ]
    client = Client(rows)
    employer = {"id": 3, "name": "Example Ltd"}
    assert evidence.stored_sector_evidence(client, employer, evidence.trusted_sector_index(client), {}) is None
    client.rows["employers"].pop()
    index = evidence.trusted_sector_index(client)
    client.rows["employers"][0] = {**rows[0], "metadata_source": "unverified"}
    assert evidence.stored_sector_evidence(client, employer, index, {}) is None
    assert evidence.stored_sector_evidence(client, {"name": "JobsIreland Employer"}, index, {}) is None


@pytest.mark.parametrize("mutation", [None, "company", "employer_id", "description", "excerpt", "employer_description"])
def test_reviewed_witness_requires_same_employer_and_unchanged_complete_body(mutation):
    body = "Example Services is a home care provider. This posting describes the company and its services."
    job = {"id": 9, "company": "EXAMPLE Services", "employer_id": 7, "description": body}
    witness = {
        "sector": "Home care",
        "job_id": 9,
        "description_sha256": hashlib.sha256(body.encode()).hexdigest(),
        "excerpt": "Example Services is a home care provider.",
        "description": "Example Services is a home care provider.",
    }
    if mutation == "excerpt":
        witness["excerpt"] = "Unsupported industry declaration"
    elif mutation == "employer_description":
        witness["description"] = "Unsupported employer headquarters and business claims"
    elif mutation:
        job[mutation] = (
            "Other company" if mutation == "company" else (8 if mutation == "employer_id" else body + "Changed")
        )
    client = Client([], [job])
    result = evidence.stored_sector_evidence(
        client, {"id": 7, "name": "Example Services"}, {}, {"example services": witness}
    )
    assert (result is not None) == (mutation is None)
    if result:
        assert result["description"] == witness["description"]
    assert not client.writes


def test_invalid_reviewed_file_fails_before_any_writes(tmp_path):
    path = tmp_path / "reviewed.json"
    path.write_text(json.dumps([{"employer_name": "JobsIreland Employer", "sector": "Finance"}]))
    with pytest.raises(ValueError):
        evidence.load_reviewed_evidence(path)


def test_programme_titles_alone_cannot_verify_shared_employer_metadata(monkeypatch):
    client = Client(
        [{"id": 7, "name": "Example Community Ltd", "metadata_source": "unverified"}],
        [
            {
                "id": 9,
                "employer_id": 7,
                "company": "Example Community Ltd",
                "source": "JobsIreland.ie",
                "title": "Gardener - CE Scheme - Example Community Ltd",
            }
        ],
    )
    monkeypatch.setattr(enrichment, "get_supabase", lambda: client)
    outcome = enrichment.run_enrichment(database_only=True, dry_run=False)
    assert outcome["updated"] == 0 and outcome["unresolved"] == 1
    assert not client.writes


def test_database_only_preview_and_apply_never_use_external_registry_or_change_jobs(monkeypatch):
    client = Client(
        [
            {"id": 1, "name": "Example", "sector": "Materials", "metadata_source": "watchlist"},
            {"id": 2, "name": "Example, Inc.", "sector": "Guessed", "metadata_source": "unverified"},
        ]
    )
    monkeypatch.setattr(enrichment, "get_supabase", lambda: client)
    monkeypatch.setattr(
        enrichment, "curated_employer", lambda _: pytest.fail("External registry used in database-only mode")
    )
    preview = enrichment.run_enrichment(database_only=True)
    assert preview["proposed"] == 1 and not client.writes
    applied = enrichment.run_enrichment(database_only=True, dry_run=False)
    assert applied["updated"] == 1
    table, payload, guards = client.writes[0]
    assert table == "employers"
    assert payload["sector"] == "Materials" and payload["metadata_source"] == "verified"
    assert payload["location"] is None and payload["latitude"] is None and payload["longitude"] is None
    assert guards == [("id", 2), ("name", "Example, Inc."), ("metadata_source", "unverified")]
    assert enrichment.run_enrichment(database_only=True, dry_run=False)["updated"] == 0
