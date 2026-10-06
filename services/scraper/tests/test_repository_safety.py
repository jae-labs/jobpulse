"""Scraper sends only catalog data and delegates tenant-sensitive maintenance to SQL."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from database import repository


@pytest.mark.parametrize("failure", ["writes", "vectors"])
def test_incomplete_ingestion_never_returns_success(monkeypatch, failure):
    client = MagicMock()
    job = {
        "title": "Engineer",
        "company": "Synthetic",
        "location": "Dublin",
        "description": "Build production systems with our engineering team. " * 5,
        "url": "https://example.invalid/ingestion",
        "source": "test",
    }
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    writer = client.table.return_value.upsert.return_value.execute
    if failure == "writes":
        writer.side_effect = RuntimeError("Synthetic write failure")
    else:
        writer.return_value = SimpleNamespace(data=[{"id": 7, **job}])
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *args: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *args: True)
    monkeypatch.setattr(repository, "prepare_embeddings", lambda rows: len(rows))
    with pytest.raises(repository.IngestionIncompleteError) as caught:
        repository.save_jobs_batch([job], enrich=False)
    assert caught.value.persisted == (1 if failure == "vectors" else 0)
    assert caught.value.failed == (1 if failure == "writes" else 0)
    assert caught.value.vectors_pending == (1 if failure == "vectors" else 0)


def test_ingestion_writes_only_vacancy_facts_and_job_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    job = {
        "title": "Engineer",
        "company": "Example",
        "location": "Dublin",
        "description": "Build and maintain production systems with the engineering team. " * 4,
        "url": "https://example.com/job",
        "source": "test",
        "relevance": 99,
        "ai_analysis": {"role_domain": "Old candidate domain"},
    }
    client.table.return_value.upsert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": 7, "title": "Engineer", "description": "Build things"}]
    )
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *args: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *args: True)
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    embedder = MagicMock()
    monkeypatch.setattr(repository, "prepare_embeddings", embedder)

    assert repository.save_jobs_batch([job], enrich=False) == 1
    payload = client.table.return_value.upsert.call_args.args[0][0]
    assert not set(payload) & {"status", "relevance", "ai_analysis", "fit_tier", "matched_skills"}
    embedder.assert_called_once_with([{"id": 7, "title": "Engineer", "description": "Build things"}])


def test_deduplication_uses_database_rpc(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.range.return_value.execute.return_value = SimpleNamespace(
        data=[
            {"id": 1, "title": "Engineer", "company": "Acme", "url": "https://example.com/job", "description": "long"},
            {"id": 2, "title": "Engineer", "company": "Acme", "url": "https://example.com/job", "description": ""},
        ]
    )
    client.rpc.return_value.execute.return_value = SimpleNamespace(data=1)
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    assert repository.deduplicate_database_jobs() == {"groups": 1, "deleted_rows": 1}
    client.rpc.assert_called_once_with(
        "merge_duplicate_catalog_jobs",
        {
            "p_keeper_id": 1,
            "p_duplicate_ids": [2],
            "p_dedupe_key": repository.normalized_key("Acme", "Engineer", "https://example.com/job"),
        },
    )


def test_canonical_job_url_preserves_requisition_query_and_strips_tracking() -> None:
    # Preserves requisition query param
    url1 = "https://jobsireland.ie/en-US/job-Details?id=2472864"
    assert repository.canonical_job_url(url1) == "https://jobsireland.ie/en-us/job-details?id=2472864"

    # Preserves multiple sorted query params
    url2 = "https://example.com/job?reqId=99&dept=engineering"
    assert repository.canonical_job_url(url2) == "https://example.com/job?dept=engineering&reqid=99"

    # Strips marketing tracking parameters
    url3 = "https://boards.greenhouse.io/company/jobs/123?gh_src=linkedin&utm_source=feed"
    assert repository.canonical_job_url(url3) == "https://boards.greenhouse.io/company/jobs/123"

    # Strips fragment
    url4 = "https://example.com/job/123#apply-section"
    assert repository.canonical_job_url(url4) == "https://example.com/job/123"


def test_save_jobs_batch_deduplicates_conflicting_rows_in_same_batch(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    # Two jobs that resolve to the exact same dedupe_key
    jobs = [
        {
            "title": "Chef",
            "company": "Confidential Employer",
            "location": "Dublin, Ireland",
            "url": "https://example.com/job/1",
            "source": "JobsIreland.ie",
            "description": "Prepare food and maintain kitchen safety standards for our restaurant team. " * 4,
        },
        {
            "title": "Chef",
            "company": "Confidential Employer",
            "location": "Dublin, Ireland",
            "url": "https://example.com/job/1",
            "source": "JobsIreland.ie",
            "description": "Prepare food and maintain kitchen safety standards for our restaurant team. " * 4,
        },
    ]
    client.table.return_value.upsert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": 10, "title": "Chef", "description": ""}]
    )
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *args: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *args: True)
    monkeypatch.setattr(repository, "prepare_embeddings", MagicMock())

    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])

    # Should deduplicate down to 1 row in the upsert payload to prevent Postgres 21000 error
    assert repository.save_jobs_batch(jobs, enrich=False) == 1
    upsert_payload = client.table.return_value.upsert.call_args.args[0]
    assert len(upsert_payload) == 1
    assert upsert_payload[0]["dedupe_key"] == repository.normalized_key(
        "Confidential Employer", "Chef", "https://example.com/job/1", "Dublin, Ireland"
    )
