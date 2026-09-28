"""Scoring input invalidation, batching, and exact similarity reuse."""

from collections import OrderedDict
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from database import repository
from database import scoring as cache
from engine import scoring


def test_contact_edits_do_not_invalidate_matching() -> None:
    profile = {"user_id": "user", "headline": "Analyst", "name": "Old", "avatar_url": "old", "updated_at": "old"}
    changed = {**profile, "name": "New", "avatar_url": "new", "updated_at": "new"}
    assert cache.profile_scoring_input(profile) == cache.profile_scoring_input(changed)


def test_weights_invalidate_scores_without_reembedding() -> None:
    profile = {"user_id": "user", "headline": "Analyst", "scoring_rules": {"weights": {"semantic": 25}}}
    changed = {**profile, "scoring_rules": {"weights": {"semantic": 10}}}
    original, updated = cache.profile_scoring_input(profile), cache.profile_scoring_input(changed)
    assert original["content_hash"] != updated["content_hash"]
    assert original["embedding_hash"] == updated["embedding_hash"]


def test_salary_change_invalidates_job_score_without_reembedding() -> None:
    job = {"id": 7, "title": "Analyst", "description": "Work", "salary_text": "€50,000", "last_seen_at": "old"}
    assert cache.job_scoring_input(job) == cache.job_scoring_input({**job, "last_seen_at": "new"})
    updated = cache.job_scoring_input({**job, "salary_text": "€80,000"})
    assert cache.job_scoring_input(job)["content_hash"] != updated["content_hash"]
    assert cache.job_scoring_input(job)["embedding_hash"] == updated["embedding_hash"]


def test_semantic_input_preserves_original_truncation() -> None:
    job = {"title": "Analyst", "description": "description " * 500}
    assert scoring.build_job_document(job) == f"{job['title']}\n{job['description']}"[:2500].strip()


def test_existing_vectors_do_not_load_model(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "job_id": 7,
                "content_hash": cache.content_hash("document"),
                "model_version": scoring.EMBEDDING_MODEL_VERSION,
            }
        ]
    )
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    encoder = Mock(side_effect=AssertionError("Cached content must not be embedded again"))
    monkeypatch.setattr(cache, "encode_documents", encoder)
    cache.prepare_embeddings("job_scoring_embeddings", "job_id", {7: "document"})
    encoder.assert_not_called()
    client.table.return_value.upsert.assert_not_called()


def test_duplicate_documents_are_embedded_once(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    encoder = Mock(return_value=[[1.0] + [0.0] * 383])
    monkeypatch.setattr(cache, "encode_documents", encoder)
    cache.prepare_embeddings("profile_scoring_embeddings", "user_id", {"a": "document", "b": "document"})
    encoder.assert_called_once_with(["document"])
    payload = client.table.return_value.upsert.call_args.args[0]
    assert len(payload) == 2
    assert payload[0]["embedding"] == payload[1]["embedding"]


def test_missing_model_does_not_persist_fake_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    monkeypatch.setattr(cache, "encode_documents", lambda *args: None)
    cache.prepare_embeddings("job_scoring_embeddings", "job_id", {7: "document"})
    client.table.return_value.upsert.assert_not_called()


def test_rule_engine_uses_supplied_similarity() -> None:
    result = scoring.evaluate_job(
        title="Analyst",
        description="Permanent analyst in Dublin",
        profile={"headline": "Analyst"},
        semantic_similarity=0.456,
    )
    assert result["semantic_similarity"] == 0.456


def test_unchanged_evaluations_are_not_written(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "prepare_embeddings", lambda *args: None)
    monkeypatch.setattr(repository, "get_scoring_work", lambda *args: [])
    evaluator = Mock(side_effect=AssertionError("No rescoring unchanged pairs"))
    monkeypatch.setattr(repository, "evaluate_job", evaluator)
    assert repository.evaluate_and_save_user_evaluations([{"id": 7}], profiles=[{"user_id": "a"}]) == 0
    evaluator.assert_not_called()
    client.table.assert_not_called()


def test_fallback_is_passed_without_pairwise_model_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "prepare_embeddings", lambda *args: None)
    monkeypatch.setattr(
        repository,
        "get_scoring_work",
        lambda *args: [
            {
                "job_id": 7,
                "user_id": "a",
                "semantic_similarity": None,
                "scoring_version": "test:fallback",
            }
        ],
    )
    monkeypatch.setattr(repository, "compute_token_frequency_similarity", lambda *args: 0.123)
    evaluator = Mock(return_value={"fit_score": 80})
    monkeypatch.setattr(repository, "evaluate_job", evaluator)
    assert repository.evaluate_and_save_user_evaluations([{"id": 7}], profiles=[{"user_id": "a"}]) == 1
    assert evaluator.call_args.kwargs["semantic_similarity"] == 0.123
    payload = client.table.return_value.upsert.call_args.args[0][0]
    assert payload["scoring_version"] == "test:fallback"


def test_document_cache_batches_unique_inputs(monkeypatch: pytest.MonkeyPatch) -> None:
    model = Mock()
    vector = [1.0] + [0.0] * 383
    model.encode.return_value = SimpleNamespace(tolist=lambda: [vector, vector])
    monkeypatch.setattr(scoring, "_DOCUMENT_EMB_CACHE", OrderedDict())
    monkeypatch.setattr(scoring, "get_semantic_model", lambda: model)
    assert scoring.encode_documents(["a", "b", "a"]) == [vector, vector, vector]
    assert scoring.encode_documents(["b", "a"]) == [vector, vector]
    model.encode.assert_called_once()
    assert model.encode.call_args.args[0] == ["a", "b"]
    assert model.encode.call_args.kwargs["normalize_embeddings"] is True


def test_document_cache_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    model = Mock()
    vector = [1.0] + [0.0] * 383
    model.encode.return_value = SimpleNamespace(tolist=lambda: [vector, vector])
    monkeypatch.setattr(scoring, "_DOCUMENT_EMB_CACHE", OrderedDict())
    monkeypatch.setattr(scoring, "_DOCUMENT_CACHE_LIMIT", 1)
    monkeypatch.setattr(scoring, "get_semantic_model", lambda: model)
    assert scoring.encode_documents(["a", "b"]) == [vector, vector]
    assert list(scoring._DOCUMENT_EMB_CACHE) == ["b"]
