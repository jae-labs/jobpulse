"""Explainable name similarity scores for human review, never identity probabilities."""

from difflib import SequenceMatcher


def symmetric_ratio(left: str, right: str) -> float:
    return (
        SequenceMatcher(None, left, right, autojunk=False).ratio()
        + SequenceMatcher(None, right, left, autojunk=False).ratio()
    ) / 2


def name_similarity(left: str, right: str) -> dict:
    """Compare normalized character sequences and token ordering without dropping qualifiers."""
    left_tokens, right_tokens = left.split(), right.split()
    score = max(
        symmetric_ratio(left, right), symmetric_ratio(" ".join(sorted(left_tokens)), " ".join(sorted(right_tokens)))
    )
    generic = {
        "the",
        "and",
        "co",
        "company",
        "group",
        "services",
        "technology",
        "technologies",
        "ireland",
        "irish",
        "uk",
        "europe",
        "international",
        "global",
        "holdings",
        "solutions",
    }
    anchors = sorted((set(left_tokens) & set(right_tokens)) - generic)
    return {
        "name_similarity": round(score * 100, 2),
        "shared_non_generic_name_tokens": anchors,
        "spelling_only": not bool(anchors),
        "extra_name_tokens": sorted(set(right_tokens) - set(left_tokens)),
        "missing_name_tokens": sorted(set(left_tokens) - set(right_tokens)),
    }
