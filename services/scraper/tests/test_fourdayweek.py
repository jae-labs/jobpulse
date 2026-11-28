"""4dayweek.io aggregator: Irish-only extraction."""

from __future__ import annotations

import pytest

from jobpulse_scraper.scrapers.core.fourdayweek import extract_fourdayweek_items


def test_extract_fourdayweek_filters_ireland() -> None:
    items = [
        {
            "title": "Senior Structures Engineer",
            "company": "Acme",
            "url": "https://4dayweek.io/job/1",
            "locations": [{"city": "Dublin", "country": "Ireland"}],
            "description": "<p>Dublin role.</p>",
        },
        {
            "title": "US Role",
            "company": "Other",
            "url": "https://4dayweek.io/job/2",
            "locations": [{"city": "Austin", "country": "United States"}],
        },
    ]
    opportunities = extract_fourdayweek_items(items)
    assert len(opportunities) == 1
    assert opportunities[0]["company"] == "Acme"
    assert opportunities[0]["source"] == "4dayweek.io"
    assert "Dublin" in opportunities[0]["location"]


def test_extract_fourdayweek_handles_string_locations() -> None:
    items = [
        {"title": "Analyst", "company": "Acme", "url": "https://4dayweek.io/job/3", "locations": ["Cork, Ireland"]}
    ]
    opportunities = extract_fourdayweek_items(items)
    assert len(opportunities) == 1
    assert opportunities[0]["location"] == "Cork, Ireland"


@pytest.mark.parametrize(
    ("company", "expected"),
    [
        ({"name": "  Example Consulting  ", "slug": "example-consulting", "employees": 100}, "Example Consulting"),
        ({"slug": "example-consulting"}, "Employer (via 4dayweek)"),
        ({"name": {"unexpected": "object"}}, "Employer (via 4dayweek)"),
        ("  ", "Employer (via 4dayweek)"),
        (None, "Employer (via 4dayweek)"),
    ],
)
def test_extract_fourdayweek_company_object(company, expected) -> None:
    opportunities = extract_fourdayweek_items(
        [{"title": "Analyst", "company": company, "url": "https://4dayweek.io/job/4", "locations": ["Cork, Ireland"]}]
    )
    assert opportunities[0]["company"] == expected
