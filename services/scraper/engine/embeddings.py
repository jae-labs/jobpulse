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
# Bump when changing the model or the text preprocessing/encoding contract.
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
    """Preserve the existing semantic scorer's title/description preprocessing."""
    return f"{job.get('title', '')}\n{job.get('description', '')}"[:2500].strip()


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
                vectors = model.encode(
                    missing,
                    batch_size=32,
                    normalize_embeddings=True,
                    convert_to_numpy=True,
                    show_progress_bar=False,
                )
                result = vectors.tolist()
                if len(result) != len(missing) or any(
                    len(vector) != 384
                    or not all(math.isfinite(value) for value in vector)
                    or not any(value != 0 for value in vector)
                    for vector in result
                ):
                    raise ValueError("Invalid embedding output")
                generated = dict(zip(missing, result, strict=True))
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
