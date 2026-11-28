"""Posting identity evidence never merges unrelated roles or candidate tracking in Python."""

from unittest.mock import Mock

import pytest

from jobpulse_scraper.database.deduplication import merge_plans, same_posting


def vacancy(identifier=1, **fields):
    return {
        "id": identifier,
        "title": "Platform Engineer",
        "company": "Synthetic Employer",
        "location": "Dublin, Ireland",
        "url": "https://jobs.example.com/job/123",
        "description": "",
        "dedupe_key": f"synthetic-{identifier}",
        "closed_at": None,
        **fields,
    }


def test_aliases_with_same_posting_retain_rich_body_and_existing_key():
    one = vacancy(1)
    two = vacancy(2, company="Synthetic Employer Ireland", description="Maintain distributed systems. " * 10)
    plans, skipped = merge_plans([one, two])
    assert skipped == 0
    assert plans[0].keeper["id"] == 2
    assert plans[0].duplicate_ids == (1,)
    assert plans[0].dedupe_key == "synthetic-2"


@pytest.mark.parametrize(
    "change",
    [
        {"title": "Engineering Manager"},
        {"location": "Cork, Ireland"},
        {"closed_at": "2026-01-01"},
        {"url": "https://jobs.example.com/job/124"},
        {"location": ""},
    ],
)
def test_conflicting_postings_never_merge(change):
    assert not same_posting(vacancy(), vacancy(2, **change))
    assert not merge_plans([vacancy(), vacancy(2, **change)])[0]


def test_generic_landing_page_cannot_prove_cross_company_identity():
    assert not same_posting(
        vacancy(url="https://example.com/careers"),
        vacancy(2, company="Different Employer", url="https://example.com/careers"),
    )


def test_whole_url_group_with_conflicting_role_is_skipped():
    plans, skipped = merge_plans([vacancy(), vacancy(2), vacancy(3, title="Other Engineer")])
    assert plans == []
    assert skipped == 1


def test_rpc_budget_is_preserved():
    assert merge_plans([vacancy(i) for i in range(102)])[1] == 1


def test_preview_reads_ordered_pages_without_rpc(monkeypatch):
    from jobpulse_scraper.database import repository

    client = Mock()
    client.table.return_value.select.return_value.order.return_value.range.return_value.execute.return_value.data = [
        vacancy(),
        vacancy(2),
    ]
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    stats = repository.deduplicate_database_jobs(apply=False)
    assert stats["candidate_rows"] == 1
    assert stats["deleted_rows"] == 0
    client.rpc.assert_not_called()
    client.table.return_value.select.return_value.order.assert_called_once_with("id")


@pytest.mark.parametrize("result", [0, RuntimeError("synthetic private text")])
def test_conflict_or_rpc_failure_is_visible_without_private_details(monkeypatch, capsys, result):
    from jobpulse_scraper.database import repository

    client = Mock()
    client.table.return_value.select.return_value.order.return_value.range.return_value.execute.return_value.data = [
        vacancy(),
        vacancy(2),
    ]
    if isinstance(result, Exception):
        client.rpc.return_value.execute.side_effect = result
    else:
        client.rpc.return_value.execute.return_value.data = result
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    stats = repository.deduplicate_database_jobs()
    assert stats["blocked_groups"] + stats["failed_groups"] == 1
    assert stats["deleted_rows"] == 0
    assert "synthetic private text" not in capsys.readouterr().out


def test_ingestion_reuses_alias_identity_without_losing_published_body(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import MagicMock

    from jobpulse_scraper.database import ingestion

    client = MagicMock()
    body = "Maintain reliable distributed production systems with the platform engineering team. " * 4
    prior = vacancy(1, description=body, employer_id=9)
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[prior])
    writer = client.table.return_value.upsert.return_value.execute
    writer.return_value = SimpleNamespace(data=[{**prior}])
    monkeypatch.setattr(ingestion, "get_supabase", lambda: client)
    monkeypatch.setattr(
        ingestion, "get_employer_lookup_service", lambda: Mock(resolve_employer=Mock(return_value=None))
    )
    monkeypatch.setattr(ingestion, "prepare_embeddings", lambda rows: 0)
    incoming = vacancy(2, company="Synthetic Source Alias", description="", source="Synthetic Source Alias")
    assert ingestion.save_jobs_batch([incoming], enrich=False) == 1
    payload = client.table.return_value.upsert.call_args.args[0][0]
    assert payload["dedupe_key"] == prior["dedupe_key"]
    assert payload["company"] == prior["company"]
    assert payload["description"] == body
    assert payload["employer_id"] == 9


def test_blank_employer_and_location_never_supply_identity():
    assert not same_posting(vacancy(company="", location=""), vacancy(2, company="", location=""))
