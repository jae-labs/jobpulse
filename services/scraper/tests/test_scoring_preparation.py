"""Prepared rules preserve complete scoring output and do no per-job compilation."""

import hashlib
import json
from unittest.mock import Mock

from engine import scoring


def test_full_scoring_output_matches_preparation_refactor_baseline(monkeypatch):
    profile = {
        "headline": "Operations manager",
        "salary_min": 60000,
        "keywords": ["planning", "sql"],
        "tools_software": ["Excel"],
        "certifications": "PMP; ITIL",
        "target_roles": ["Operations manager", "Analyst"],
        "target_locations": ["Cork", "Dublin"],
        "location": "Ireland",
        "work_mode": "Remote, Hybrid",
        "work_authorization": "Requires visa sponsorship",
        "employment": "Permanent only",
        "scoring_rules": {
            "positive_domains": [
                {"name": "Operations", "keywords": ["operations", r"\b[Pp]lanning\b"], "note": "Domain fit"}
            ],
            "negative_domains": [
                {"name": "Engineering", "keywords": ["engineer"], "reason": "Requires engineering qualification"}
            ],
            "seniority_tiers": [{"name": "Senior", "keywords": ["senior"], "score_weight": 1, "note": "Senior fit"}],
            "disqualifiers": ["Irish", r"\bREQUIRED\b", r"[invalid"],
            "weights": {"semantic": 18},
        },
    }
    jobs = [
        {
            "title": title,
            "description": description,
            "location": loc,
            "employment_type": employment,
            "salary_text": salary,
            "salary_min_amount": amount,
            "salary_currency": "EUR",
            "salary_period": "annual",
        }
        for title in ["Senior Operations manager", "Engineer", "Analyst", "Unrelated role"]
        for description in [
            "Planning with SQL and Excel. Hybrid, permanent role.",
            "Irish REQUIRED. Fixed-term on-site, no visa sponsorship.",
            "Remote contract role. Visa sponsorship available.",
            "[invalid requirement",
        ]
        for loc in ["Dublin", "Cork"]
        for employment in ["Permanent", "Fixed-term"]
        for salary, amount in [(None, None), ("€70,000", 70000), ("€40,000", 40000)]
    ]
    prepared = scoring.prepare_scoring_profile(profile)
    compiler = Mock(side_effect=AssertionError("Profile patterns must be compiled once"))
    monkeypatch.setattr(scoring, "compile_terms_to_regex", compiler)
    outputs = [scoring.evaluate_job(**job, profile=prepared, semantic_similarity=0.65) for job in jobs]
    # Baseline covers domain matches/exclusions, regex flags, malformed terms,
    # contracts, skills/certifications, salary, locations, sponsorship and caps.
    digest = hashlib.sha256(json.dumps(outputs, sort_keys=True).encode()).hexdigest()
    assert len(outputs) == 192
    assert digest == "e781a7965bf7fc9285d29fb8b6f1608ca828902950906f1ad3cc222d8f3b7602"
    compiler.assert_not_called()
