"""Canonical profile fields, defaults, and preference behavior."""

import pytest

from database.scoring import profile_scoring_input
from engine.scoring import evaluate_job, get_scoring_rules


def evaluate(profile: dict, **job) -> dict:
    if "salary_text" in job and not any(key.startswith("salary_") and key != "salary_text" for key in job):
        amount = int(job["salary_text"].replace("€", "").replace(",", ""))
        job.update(salary_min_amount=amount, salary_max_amount=amount, salary_currency="EUR", salary_period="annual")
    return evaluate_job(title="Analyst", profile=profile, semantic_similarity=0.5, **job)


def test_salary_target_uses_database_field_and_preserves_zero() -> None:
    assert evaluate({"salary_min": 100000}, salary_text="€70,000")["sub_scores"]["salary"] == 0.3
    assert evaluate({"salary_min": 50000}, salary_text="€70,000")["sub_scores"]["salary"] == 1
    assert evaluate({"salary_min": 0}, salary_text="€30,000")["sub_scores"]["salary"] == 1


def test_empty_rules_stay_empty_and_partial_weights_merge_defaults() -> None:
    rules = get_scoring_rules(
        {"scoring_rules": {"disqualifiers": [], "positive_domains": [], "weights": {"semantic": 0}}}
    )
    assert rules["disqualifiers"] == []
    assert rules["positive_domains"] == []
    assert rules["weights"]["semantic"] == 0
    assert rules["weights"]["domain"] == 25


@pytest.mark.parametrize("preference", ["Permanent & Fixed-term", "Contract / Specified Purpose", "Open to all"])
def test_accepted_contracts_do_not_receive_permanent_preference_penalty(preference: str) -> None:
    result = evaluate({"employment": preference}, employment_type="Fixed-term")
    assert result["sub_scores"]["contract"] == 1
    assert result["sub_scores"]["fixed_term"] == 0


def test_permanent_preference_penalizes_fixed_term_and_contract_preference_penalizes_permanent() -> None:
    permanent = evaluate({"employment": "Permanent only"}, employment_type="Fixed-term")
    contract = evaluate({"employment": "Contract / Specified Purpose"}, employment_type="Permanent")
    assert permanent["sub_scores"]["contract"] == 0.55
    assert permanent["sub_scores"]["fixed_term"] == 1
    assert contract["sub_scores"]["contract"] == 0.55
    assert contract["sub_scores"]["fixed_term"] == 0


def test_contract_preference_invalidates_scores_without_reembedding() -> None:
    profile = {"user_id": "a", "employment": "Permanent only"}
    first = profile_scoring_input(profile)
    changed = profile_scoring_input({**profile, "employment": "Open to all"})
    assert first["content_hash"] != changed["content_hash"]
    assert first["embedding_hash"] == changed["embedding_hash"]


def test_location_factor_preserves_order_in_preview_input() -> None:
    result = evaluate({"target_locations": ["Cork", "Dublin"]}, location="Dublin")
    assert result["sub_scores"]["location"] == 0.8


@pytest.mark.parametrize("currency,period", [("USD", "annual"), ("EUR", "hourly"), ("EUR", "monthly")])
def test_non_comparable_salary_is_neutral(currency: str, period: str) -> None:
    result = evaluate(
        {"salary_min": 50000},
        salary_text="Advertised pay",
        salary_max_amount=90000,
        salary_currency=currency,
        salary_period=period,
    )
    assert result["sub_scores"]["salary"] == 0.75
