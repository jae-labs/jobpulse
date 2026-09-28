"""Regression checks for user-owned data during scraper maintenance."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from database import repository


def test_evaluations_use_user_id_after_email_column_removal(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    client.table.return_value.upsert.return_value.execute.return_value = SimpleNamespace(data=[{"id": 1}])
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    monkeypatch.setattr(repository, "evaluate_job", lambda **kwargs: {"fit_score": 80})
    monkeypatch.setattr(repository, "extract_salary_from_context", lambda *args: "")
    monkeypatch.setattr(repository, "prepare_embeddings", lambda *args: None)
    monkeypatch.setattr(
        repository,
        "get_scoring_work",
        lambda *args: [
            {
                "user_id": "account-1",
                "job_id": 7,
                "semantic_similarity": 0.8,
                "scoring_version": "test",
            }
        ],
    )

    count = repository.evaluate_and_save_user_evaluations(
        [{"id": 7, "title": "Engineer", "description": "Build things"}],
        profiles=repository.prepare_scoring_profiles([{"user_id": "account-1"}]),
    )

    assert count == 1
    payload = client.table.return_value.upsert.call_args.args[0][0]
    assert payload["user_id"] == "account-1"
    assert "user_email" not in payload
    assert client.table.return_value.upsert.call_args.kwargs["on_conflict"] == "user_id,job_id"


def test_pruning_stops_when_status_check_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    jobs = MagicMock()
    jobs.select.return_value.order.return_value.lt.return_value.range.return_value.execute.return_value = (
        SimpleNamespace(data=[{"id": 7, "status": "new", "last_seen_at": "2020-01-01"}])
    )
    statuses = MagicMock()
    statuses.select.return_value.in_.return_value.order.return_value.range.return_value.execute.side_effect = (
        RuntimeError("database unavailable")
    )
    client = MagicMock()
    client.table.side_effect = lambda name: jobs if name == "jobs" else statuses
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())

    with pytest.raises(RuntimeError, match="Cannot prune jobs"):
        repository.prune_stale_jobs()

    jobs.delete.assert_not_called()


class _Query:
    def __init__(self, rows: dict[str, list[dict]], table: str) -> None:
        self.rows = rows
        self.table = table
        self.operation = "select"
        self.job_id: int | None = None
        self.payload: dict | None = None
        self.ids: list[int] | None = None

    def select(self, _columns: str) -> "_Query":
        return self

    def eq(self, column: str, value: int) -> "_Query":
        if column == "job_id":
            self.job_id = value
        return self

    def range(self, _start: int, _end: int) -> "_Query":
        return self

    def insert(self, payload: dict) -> "_Query":
        self.operation = "insert"
        self.payload = payload
        return self

    def delete(self) -> "_Query":
        self.operation = "delete"
        return self

    def in_(self, _column: str, ids: list[int]) -> "_Query":
        self.ids = ids
        return self

    def execute(self) -> SimpleNamespace:
        if self.operation == "insert":
            assert self.payload is not None
            self.rows[self.table].append(self.payload)
            return SimpleNamespace(data=[self.payload])
        if self.operation == "delete":
            deleted = [row for row in self.rows[self.table] if row["id"] in (self.ids or [])]
            self.rows[self.table] = [row for row in self.rows[self.table] if row not in deleted]
            return SimpleNamespace(data=deleted)
        rows = self.rows[self.table]
        if self.job_id is not None:
            rows = [row for row in rows if row.get("job_id") == self.job_id]
        return SimpleNamespace(data=rows)


def test_deduplication_transfers_user_owned_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = {
        "jobs": [
            {
                "id": 1,
                "title": "Engineer",
                "company": "Acme",
                "url": "https://example.com/1",
                "description": "long",
                "dedupe_key": repository.normalized_key("Acme", "Engineer", "https://example.com/1"),
            },
            {"id": 2, "title": "Engineer", "company": "Acme", "url": "https://example.com/1", "description": ""},
        ],
        "user_job_statuses": [{"user_id": "account-1", "job_id": 2, "status": "applied", "updated_at": None}],
        "user_job_evaluations": [
            {
                "user_id": "account-1",
                "job_id": 2,
                "relevance": 80,
                "fit_tier": "high",
                "matched_skills": [],
                "ai_analysis": None,
                "calculated_at": None,
            }
        ],
    }
    client = SimpleNamespace(table=lambda name: _Query(rows, name))
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())

    result = repository.deduplicate_database_jobs()

    assert result["deleted_rows"] == 1
    assert [row["id"] for row in rows["jobs"]] == [1]
    assert any(row["job_id"] == 1 and row["status"] == "applied" for row in rows["user_job_statuses"])
    assert any(row["job_id"] == 1 and row["relevance"] == 80 for row in rows["user_job_evaluations"])


def test_deduplication_keeps_duplicates_if_transfer_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = {
        "jobs": [
            {"id": 1, "title": "Engineer", "company": "Acme", "url": "https://example.com/1", "description": "long"},
            {"id": 2, "title": "Engineer", "company": "Acme", "url": "https://example.com/1", "description": ""},
        ],
        "user_job_statuses": [{"user_id": "account-1", "job_id": 2, "status": "applied", "updated_at": None}],
        "user_job_evaluations": [],
    }

    class FailingQuery(_Query):
        def execute(self) -> SimpleNamespace:
            if self.operation == "insert":
                raise RuntimeError("transfer unavailable")
            return super().execute()

    client = SimpleNamespace(table=lambda name: FailingQuery(rows, name))
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())

    result = repository.deduplicate_database_jobs()

    assert result["deleted_rows"] == 0
    assert len(rows["jobs"]) == 2


def test_deduplication_keeps_conflicting_tracking_statuses(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = {
        "jobs": [
            {"id": 1, "title": "Engineer", "company": "Acme", "url": "https://example.com/1", "description": "long"},
            {"id": 2, "title": "Engineer", "company": "Acme", "url": "https://example.com/1", "description": ""},
        ],
        "user_job_statuses": [
            {"user_id": "account-1", "job_id": 1, "status": "new", "updated_at": None},
            {"user_id": "account-1", "job_id": 2, "status": "applied", "updated_at": None},
        ],
        "user_job_evaluations": [],
    }
    client = SimpleNamespace(table=lambda name: _Query(rows, name))
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())

    result = repository.deduplicate_database_jobs()

    assert result["deleted_rows"] == 0
    assert len(rows["jobs"]) == 2


def test_ingestion_writes_only_vacancy_facts_without_loading_profiles_or_scoring(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = MagicMock()
    job = {
        "title": "Engineer",
        "company": "Example",
        "location": "Dublin",
        "description": "Build things",
        "url": "https://example.com/job",
        "source": "test",
        "relevance": 99,
        "ai_analysis": {"role_domain": "Old candidate domain"},
    }
    client.table.return_value.upsert.return_value.execute.return_value = SimpleNamespace(data=[{"id": 7}])
    profiles = MagicMock(side_effect=AssertionError("Ingestion must not load candidates"))
    evaluator = MagicMock()
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    monkeypatch.setattr(repository, "get_all_user_profiles", profiles)
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *args: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *args: True)
    monkeypatch.setattr(repository, "evaluate_and_save_user_evaluations", evaluator)

    monkeypatch.setattr(repository, "_enrich_job", lambda job: job)
    assert repository.save_jobs_batch([job]) == 1
    payload = client.table.return_value.upsert.call_args.args[0][0]
    assert not set(payload) & {
        "status",
        "relevance",
        "ai_analysis",
        "fit_tier",
        "matched_skills",
        "role_domain",
        "seniority_level",
    }
    evaluator.assert_not_called()
    profiles.assert_not_called()


def test_profile_read_failure_does_not_report_an_empty_successful_scoring_run(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.order.return_value.range.return_value.execute.side_effect = (
        RuntimeError("unavailable")
    )
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    with pytest.raises(RuntimeError, match="scoring cannot safely continue"):
        repository.get_all_user_profiles()


def test_pruning_preserves_tracking_beyond_the_first_status_page(monkeypatch):
    jobs = MagicMock()
    jobs.select.return_value.order.return_value.lt.return_value.range.return_value.execute.return_value = (
        SimpleNamespace(data=[{"id": 7, "last_seen_at": "2020-01-01"}])
    )
    statuses = MagicMock()
    statuses.select.return_value.in_.return_value.order.return_value.range.return_value.execute.side_effect = [
        SimpleNamespace(data=[{"job_id": 7, "status": "new"}] * 500),
        SimpleNamespace(data=[{"job_id": 7, "status": "applied"}]),
    ]
    client = MagicMock()
    client.table.side_effect = lambda name: jobs if name == "jobs" else statuses
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "retry_supabase", lambda fn: fn())
    result = repository.prune_stale_jobs()
    assert result["deleted_count"] == 0
    assert result["retained_count"] == 1
    jobs.delete.assert_not_called()
