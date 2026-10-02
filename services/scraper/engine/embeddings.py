"""Batch job embeddings using SentenceTransformers."""

from __future__ import annotations

import math
import threading
from collections import OrderedDict
from typing import Any

_EMBEDDING_MODEL: Any = None
_DOCUMENT_EMB_CACHE: OrderedDict[str, list[float]] = OrderedDict()
_DOCUMENT_CACHE_LIMIT = 4096
_model_lock = threading.RLock()
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
# This identifies the vector space shared with browser profile embeddings.
# Job-only preprocessing revisions invalidate the job content hash separately.
EMBEDDING_MODEL_VERSION = "all-MiniLM-L6-v2:384:v1"


def get_semantic_model() -> Any:
    """Lazy load SentenceTransformer singleton on Apple Silicon MPS (Metal) or CPU."""
    global _EMBEDDING_MODEL
    with _model_lock:
        if _EMBEDDING_MODEL is None:
            try:
                import torch
                from sentence_transformers import SentenceTransformer

                device = "mps" if torch.backends.mps.is_available() else "cpu"
                _EMBEDDING_MODEL = SentenceTransformer(EMBEDDING_MODEL_NAME, device=device)
            except Exception as exc:
                print(
                    f"  [AI ENGINE] Notice: Local SentenceTransformer unavailable ({exc}). Job embeddings unavailable."
                )
                _EMBEDDING_MODEL = False
    return _EMBEDDING_MODEL


def build_job_document(job: dict[str, Any]) -> str:
    """Include the published body; the encoder handles the model's token window."""
    return f"{job.get('title', '')}\n{job.get('description', '')}".strip()


def _document_chunks(model: Any, document: str) -> list[str]:
    """Use token windows so requirements at the end of long ads contribute too."""
    tokens = model.tokenizer.encode(document, add_special_tokens=False, verbose=False)
    window = model.max_seq_length - model.tokenizer.num_special_tokens_to_add(pair=False)
    if window <= 32:
        raise ValueError("Invalid embedding token window")
    if len(tokens) <= window:
        return [document]
    step = window - 32
    chunks = []
    for start in range(0, len(tokens), step):
        chunks.append(model.tokenizer.decode(tokens[start : start + window], skip_special_tokens=True))
        if start + window >= len(tokens):
            break
    return chunks


def _pool_chunk_vectors(vectors: list[list[float]]) -> list[float]:
    """Normalize the mean in the same MiniLM space as candidate profile vectors."""
    mean = [sum(values) / len(vectors) for values in zip(*vectors, strict=True)]
    magnitude = math.sqrt(sum(value * value for value in mean))
    if magnitude == 0:
        raise ValueError("Empty pooled embedding")
    return [value / magnitude for value in mean]


def encode_documents(documents: list[str]) -> list[list[float]] | None:
    """Encode each distinct document once in batches; never persist fallback vectors."""
    if not documents:
        return []
    with _model_lock:
        missing = list(dict.fromkeys(document for document in documents if document not in _DOCUMENT_EMB_CACHE))
        generated = {}
        if missing:
            model = get_semantic_model()
            if not model:
                return None
            try:
                chunks_by_document = [_document_chunks(model, document) for document in missing]
                chunks = list(dict.fromkeys(chunk for group in chunks_by_document for chunk in group))
                vectors = model.encode(
                    chunks,
                    batch_size=32,
                    normalize_embeddings=True,
                    convert_to_numpy=True,
                    show_progress_bar=False,
                )
                result = vectors.tolist()
                if len(result) != len(chunks) or any(
                    len(vector) != 384
                    or not all(math.isfinite(value) for value in vector)
                    or not any(value != 0 for value in vector)
                    for vector in result
                ):
                    raise ValueError("Invalid embedding output")
                chunk_vectors = dict(zip(chunks, result, strict=True))
                generated = {
                    document: _pool_chunk_vectors([chunk_vectors[chunk] for chunk in group])
                    for document, group in zip(missing, chunks_by_document, strict=True)
                }
            except Exception:
                print("  [AI ENGINE] Batch encoding unavailable. No vectors were written.")
                return None
        output = [
            generated[document] if document in generated else _DOCUMENT_EMB_CACHE[document] for document in documents
        ]
        for document, vector in zip(documents, output, strict=True):
            _DOCUMENT_EMB_CACHE[document] = vector
            _DOCUMENT_EMB_CACHE.move_to_end(document)
        while len(_DOCUMENT_EMB_CACHE) > _DOCUMENT_CACHE_LIMIT:
            _DOCUMENT_EMB_CACHE.popitem(last=False)
        return output
