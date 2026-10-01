"""Job fact invalidation and embedding batch reuse."""

from collections import OrderedDict
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from database import embeddings as cache
from engine import embeddings as scoring


def test_salary_change_invalidates_job_score_without_changing_document() -> None:
    job = {"id": 7, "title": "Analyst", "description": "Work", "salary_text": "€50,000", "last_seen_at": "old"}
    assert cache.job_scoring_hash(job) == cache.job_scoring_hash({**job, "last_seen_at": "new"})
    updated = {**job, "salary_text": "€80,000"}
    assert cache.job_scoring_hash(job) != cache.job_scoring_hash(updated)
    assert scoring.build_job_document(job) == scoring.build_job_document(updated)


def test_salary_change_rewrites_embedding_row_to_trigger_sql_rescore(monkeypatch: pytest.MonkeyPatch) -> None:
    previous = {"id": 7, "title": "Analyst", "description": "Work", "salary_text": "€50,000"}
    updated = {**previous, "salary_text": "€80,000"}
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "job_id": 7,
                "content_hash": cache.job_scoring_hash(previous),
                "model_version": scoring.EMBEDDING_MODEL_VERSION,
            }
        ]
    )
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    encoder = Mock(return_value=[[1.0] + [0.0] * 383])
    monkeypatch.setattr(cache, "encode_documents", encoder)

    cache.prepare_embeddings([updated])

    encoder.assert_called_once_with(["Analyst\nWork"])
    payload = client.table.return_value.upsert.call_args.args[0]
    assert payload[0]["content_hash"] == cache.job_scoring_hash(updated)


def test_semantic_input_preserves_original_truncation() -> None:
    job = {"title": "Analyst", "description": "description " * 500}
    assert scoring.build_job_document(job) == f"{job['title']}\n{job['description']}"[:2500].strip()


def test_existing_vectors_do_not_load_model(monkeypatch: pytest.MonkeyPatch) -> None:
    job = {"id": 7, "description": "document"}
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "job_id": 7,
                "content_hash": cache.job_scoring_hash(job),
                "model_version": scoring.EMBEDDING_MODEL_VERSION,
            }
        ]
    )
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    encoder = Mock(side_effect=AssertionError("Cached content must not be embedded again"))
    monkeypatch.setattr(cache, "encode_documents", encoder)
    cache.prepare_embeddings([job])
    encoder.assert_not_called()
    client.table.return_value.upsert.assert_not_called()


def test_duplicate_documents_are_embedded_once(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    encoder = Mock(return_value=[[1.0] + [0.0] * 383])
    monkeypatch.setattr(cache, "encode_documents", encoder)
    cache.prepare_embeddings([{"id": 7, "description": "document"}, {"id": 8, "description": "document"}])
    encoder.assert_called_once_with(["document"])
    payload = client.table.return_value.upsert.call_args.args[0]
    assert len(payload) == 2
    assert payload[0]["embedding"] == payload[1]["embedding"]


def test_missing_model_does_not_persist_fake_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    monkeypatch.setattr(cache, "encode_documents", lambda *args: None)
    cache.prepare_embeddings([{"id": 7, "description": "document"}])
    client.table.return_value.upsert.assert_not_called()


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
