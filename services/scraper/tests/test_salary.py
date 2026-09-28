"""Salary extraction must preserve facts needed by database normalization."""

import pytest

from engine.salary import extract_salary_from_context


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Salary: €55.5–70k per annum", "€55.5–70k per annum"),
        ("Pay €45 - €55 per hour", "€45 - €55 per hour"),
        ("Salary: $9,000 monthly", "$9,000 monthly"),
        ("Compensation £55000/year", "£55000/year"),
        ("€60,000 - €75,000 annual", "€60,000 - €75,000 annual"),
        ("Pay €25/hr", "€25/hr"),
        ("Salary negotiable", None),
    ],
)
def test_salary_extraction_preserves_advertised_units(text: str, expected: str | None) -> None:
    assert extract_salary_from_context(text) == expected
