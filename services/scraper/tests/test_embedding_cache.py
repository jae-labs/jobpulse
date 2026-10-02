"""Job fact invalidation and embedding batch reuse."""

from collections import OrderedDict
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from database import embeddings as cache
from engine import embeddings as scoring

BODY = "Build reports and operate analytics systems for our engineering team. " * 4


def test_salary_change_invalidates_job_score_without_changing_document() -> None:
    job = {"id": 7, "title": "Analyst", "description": BODY, "salary_text": "€50,000", "last_seen_at": "old"}
    assert cache.job_scoring_hash(job) == cache.job_scoring_hash({**job, "last_seen_at": "new"})
    updated = {**job, "salary_text": "€80,000"}
    assert cache.job_scoring_hash(job) != cache.job_scoring_hash(updated)
    assert scoring.build_job_document(job) == scoring.build_job_document(updated)


def test_salary_change_rewrites_embedding_row_to_trigger_sql_rescore(monkeypatch: pytest.MonkeyPatch) -> None:
    previous = {"id": 7, "title": "Analyst", "description": BODY, "salary_text": "€50,000"}
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

    encoder.assert_called_once_with([f"Analyst\n{BODY}".strip()])
    payload = client.table.return_value.upsert.call_args.args[0]
    assert payload[0]["content_hash"] == cache.job_scoring_hash(updated)


def test_semantic_input_preserves_full_body() -> None:
    job = {"title": "Analyst", "description": "description " * 500}
    assert scoring.build_job_document(job) == f"{job['title']}\n{job['description']}".strip()


def test_existing_vectors_do_not_load_model(monkeypatch: pytest.MonkeyPatch) -> None:
    job = {"id": 7, "description": BODY}
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
    cache.prepare_embeddings([{"id": 7, "description": BODY}, {"id": 8, "description": BODY}])
    encoder.assert_called_once_with([BODY.strip()])
    payload = client.table.return_value.upsert.call_args.args[0]
    assert len(payload) == 2
    assert payload[0]["embedding"] == payload[1]["embedding"]


def test_missing_model_does_not_persist_fake_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    monkeypatch.setattr(cache, "encode_documents", lambda *args: None)
    cache.prepare_embeddings([{"id": 7, "description": BODY}])
    client.table.return_value.upsert.assert_not_called()


def test_document_cache_batches_unique_inputs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(scoring, "_document_chunks", lambda _model, document: [document])
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
    monkeypatch.setattr(scoring, "_document_chunks", lambda _model, document: [document])
    model = Mock()
    vector = [1.0] + [0.0] * 383
    model.encode.return_value = SimpleNamespace(tolist=lambda: [vector, vector])
    monkeypatch.setattr(scoring, "_DOCUMENT_EMB_CACHE", OrderedDict())
    monkeypatch.setattr(scoring, "_DOCUMENT_CACHE_LIMIT", 1)
    monkeypatch.setattr(scoring, "get_semantic_model", lambda: model)
    assert scoring.encode_documents(["a", "b"]) == [vector, vector]
    assert list(scoring._DOCUMENT_EMB_CACHE) == ["b"]


def test_full_body_token_windows_cover_tail() -> None:
    tokenizer = SimpleNamespace(
        encode=lambda text, **_kwargs: text.split(),
        decode=lambda tokens, **_kwargs: " ".join(tokens),
        num_special_tokens_to_add=lambda **_kwargs: 2,
    )
    model = SimpleNamespace(tokenizer=tokenizer, max_seq_length=64)
    document = " ".join(f"token{index}" for index in range(200))
    chunks = scoring._document_chunks(model, document)
    assert all(len(chunk.split()) <= 62 for chunk in chunks)
    assert set(document.split()) == {token for chunk in chunks for token in chunk.split()}
    assert chunks[-1].endswith("token199")


def test_tail_chunk_changes_semantic_vector(monkeypatch: pytest.MonkeyPatch) -> None:
    tokenizer = SimpleNamespace(
        encode=lambda text, **_kwargs: text.split(),
        decode=lambda tokens, **_kwargs: " ".join(tokens),
        num_special_tokens_to_add=lambda **_kwargs: 2,
    )

    def encode(chunks, **_kwargs):
        return SimpleNamespace(
            tolist=lambda: [
                ([0.0, 1.0] if "tail_requirement" in chunk else [1.0, 0.0]) + [0.0] * 382 for chunk in chunks
            ]
        )

    model = SimpleNamespace(tokenizer=tokenizer, max_seq_length=64, encode=encode)
    monkeypatch.setattr(scoring, "_DOCUMENT_EMB_CACHE", OrderedDict())
    monkeypatch.setattr(scoring, "get_semantic_model", lambda: model)
    vector = scoring.encode_documents(["introduction " * 200 + "tail_requirement"])[0]
    assert vector[1] > 0
    assert sum(value * value for value in vector) == pytest.approx(1.0)


def test_stub_vectors_are_withdrawn_without_touching_tracking(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(
        data=[{"job_id": 7, "content_hash": "old", "model_version": scoring.EMBEDDING_MODEL_VERSION}]
    )
    monkeypatch.setattr(cache, "get_supabase", lambda: client)
    encoder = Mock(side_effect=AssertionError("Listing metadata is not a semantic document"))
    monkeypatch.setattr(cache, "encode_documents", encoder)
    cache.prepare_embeddings([{"id": 7, "description": "Example position: Engineer. Location: Dublin."}])
    client.table.return_value.delete.return_value.in_.assert_called_once_with("job_id", [7])
    assert all(call.args == ("job_scoring_embeddings",) for call in client.table.call_args_list)
    client.rpc.assert_not_called()
    client.table.return_value.upsert.assert_not_called()
    encoder.assert_not_called()
