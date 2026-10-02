"""Employer identity and vacancy facts must remain distinct."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from database import repository
from engine.text_cleaner import normalize_location
from pipeline import employer_lookup as lookup


@pytest.fixture(autouse=True)
def clear_cache():
    lookup._EMPLOYER_CACHE.clear()
    yield
    lookup._EMPLOYER_CACHE.clear()


def test_aliases_remove_only_trailing_suffixes():
    assert lookup.normalize_company_key("Example Ireland Ltd") == "example"
    assert lookup.normalize_company_key("Group Example") == "group example"
    assert lookup.normalize_company_key("Example   Systems Ltd") == "example systems"


def test_database_match_is_literal_and_ambiguity_is_rejected():
    client = MagicMock()
    client.table().select().ilike().limit().execute.return_value = SimpleNamespace(data=[])
    service = lookup.EmployerLookupService(client)
    assert service.lookup_employer_in_db("Example%_Labs") is None
    client.table().select().ilike.assert_called_with("name", "Example\\%\\_Labs")
    client.table().select().ilike().limit().execute.return_value = SimpleNamespace(data=[{"id": 1}, {"id": 2}])
    with pytest.raises(ValueError, match="Ambiguous"):
        service.resolve_employer("Example")
    client.table().insert.assert_not_called()


def test_unknown_metadata_and_dry_run_never_insert_or_infer_headquarters():
    client = MagicMock()
    client.table().select().ilike().limit().execute.return_value = SimpleNamespace(data=[])
    service = lookup.EmployerLookupService(client)
    employer = service.resolve_employer("Example Paint Supplies", scraped_location="Cork", persist=False)
    assert employer["sector"] == "Uncategorized"
    assert employer["metadata_source"] == "unverified"
    assert employer["location"] is None
    assert employer["latitude"] is None
    client.table().insert.assert_not_called()
    assert not lookup._EMPLOYER_CACHE


def test_failed_insert_does_not_poison_cache():
    client = MagicMock()
    client.table().select().ilike().limit().execute.return_value = SimpleNamespace(data=[])
    client.table().insert().execute.side_effect = RuntimeError("Synthetic failure")
    service = lookup.EmployerLookupService(client)
    assert service.resolve_employer("Example Retry") is None
    assert not lookup._EMPLOYER_CACHE
    client.table().insert().execute.side_effect = None
    client.table().insert().execute.return_value = SimpleNamespace(data=[{"id": 77, "name": "Example Retry"}])
    assert service.resolve_employer("Example Retry")["id"] == 77


@pytest.mark.parametrize("location", ["Hybrid", "Remote", "Cork, Ireland"])
@pytest.mark.parametrize("coordinates", [(None, None), (0, 0), (91, -6), (53, None)])
def test_ingestion_preserves_posting_location_and_valid_coordinate_pairs(monkeypatch, location, coordinates):
    client = MagicMock()
    client.table().select().in_().execute.return_value = SimpleNamespace(data=[])
    client.table().upsert().execute.return_value = SimpleNamespace(data=[])
    employer = MagicMock()
    employer.resolve_employer.return_value = {
        "id": 501,
        "location": "Dublin, Ireland",
        "latitude": 53.34,
        "longitude": -6.26,
    }
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "get_employer_lookup_service", lambda: employer)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    monkeypatch.setattr(repository, "prepare_embeddings", MagicMock())
    repository.save_jobs_batch(
        [
            {
                "title": "Civil Engineer",
                "company": "Example Infrastructure",
                "location": location,
                "latitude": coordinates[0],
                "longitude": coordinates[1],
                "description": "Lead civil engineering, drainage planning and bridge inspections with the infrastructure team. "
                * 3,
                "url": "https://example.invalid/vacancy/1",
                "source": "test",
            }
        ],
        enrich=False,
    )
    saved = client.table().upsert.call_args.args[0][0]
    assert saved["location"] == normalize_location(location)
    assert saved["employer_id"] == 501
    valid = coordinates == (0, 0)
    assert (saved["latitude"], saved["longitude"]) == ((0, 0) if valid else (None, None))
    assert saved["coordinate_source"] == ("posting" if valid else None)


def test_curated_evidence_upgrades_guessed_metadata_without_dry_run_writes(monkeypatch):
    client = MagicMock()
    existing = {"id": 8, "name": "Example Anchor", "sector": "Guessed", "metadata_source": "unverified"}
    client.table().select().ilike().limit().execute.return_value = SimpleNamespace(data=[existing])
    curated = {
        "name": "Example Anchor",
        "sector": "Verified Sector",
        "location": "Cork, Ireland",
        "latitude": 51.9,
        "longitude": -8.5,
        "description": "Synthetic company",
        "website": "https://example.invalid",
    }
    monkeypatch.setitem(lookup.CURATED_IRISH_EMPLOYERS, "example anchor", curated)
    service = lookup.EmployerLookupService(client)
    preview = service.resolve_employer("Example Anchor", persist=False)
    assert preview["metadata_source"] == "curated"
    client.table().update.assert_not_called()
    assert not lookup._EMPLOYER_CACHE
    client.table().update().eq().eq().execute.return_value = SimpleNamespace(
        data=[{**existing, **curated, "metadata_source": "curated"}]
    )
    assert service.resolve_employer("Example Anchor")["sector"] == "Verified Sector"
    assert client.table().update.call_args.args[0]["metadata_source"] == "curated"
    client.table().update().eq.assert_called_with("id", 8)


def test_optional_lookup_failure_does_not_erase_valid_catalog_metadata(monkeypatch):
    client = MagicMock()
    key = repository.normalized_key("Example", "Engineer", "https://example.invalid/job")
    client.table().select().in_().execute.return_value = SimpleNamespace(
        data=[
            {
                "dedupe_key": key,
                "description": "Build production systems with the engineering team. " * 4,
                "employer_id": 5,
                "location": normalize_location("Cork"),
                "latitude": 0,
                "longitude": 0,
                "coordinate_source": "posting",
            }
        ]
    )
    client.table().upsert().execute.return_value = SimpleNamespace(data=[])
    service = MagicMock()
    service.resolve_employer.return_value = None
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "get_employer_lookup_service", lambda: service)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    monkeypatch.setattr(repository, "prepare_embeddings", MagicMock())
    repository.save_jobs_batch(
        [
            {
                "title": "Engineer",
                "company": "Example",
                "location": "Cork",
                "description": "Listing stub",
                "url": "https://example.invalid/job",
                "source": "test",
            }
        ],
        enrich=False,
    )
    saved = client.table().upsert.call_args.args[0][0]
    assert saved["employer_id"] == 5
    assert (saved["latitude"], saved["longitude"], saved["coordinate_source"]) == (0, 0, "posting")
