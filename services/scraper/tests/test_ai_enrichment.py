"""Unit tests for AI-powered company and Ireland office enrichment."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pipeline.ai_enrichment import (
    ENRICHMENT_SCHEMA,
    VALID_SIZES,
    enrich_companies_with_ai,
    extract_domain,
    find_agy_binary,
    is_valid_ireland_coordinate,
    slugify_name,
)
from tools.enrich_companies_ai import apply_company_enrichment


def test_schema_structure() -> None:
    assert ENRICHMENT_SCHEMA["type"] == "object"
    assert "companies" in ENRICHMENT_SCHEMA["properties"]
    items = ENRICHMENT_SCHEMA["properties"]["companies"]["items"]["properties"]
    assert "size" in items
    assert set(items["size"]["enum"]) == set(VALID_SIZES)
    assert "offices" in items


def test_slugify_name() -> None:
    assert slugify_name("Stripe, Inc.") == "stripe-inc"
    assert slugify_name("Amazon Web Services (AWS)") == "amazon-web-services-aws"
    assert slugify_name("Pfizer Ireland") == "pfizer-ireland"


def test_extract_domain() -> None:
    assert extract_domain("https://www.stripe.com/en-ie") == "stripe.com"
    assert extract_domain("https://intercom.com") == "intercom.com"
    assert extract_domain("http://sub.domain.co.uk/") == "sub.domain.co.uk"
    assert extract_domain("") is None
    assert extract_domain(None) is None


def test_is_valid_ireland_coordinate() -> None:
    # Dublin
    assert is_valid_ireland_coordinate(53.3498, -6.2603) is True
    # Cork
    assert is_valid_ireland_coordinate(51.8985, -8.4756) is True
    # Galway
    assert is_valid_ireland_coordinate(53.2707, -9.0568) is True
    # New York (invalid)
    assert is_valid_ireland_coordinate(40.7128, -74.0060) is False
    # London (invalid)
    assert is_valid_ireland_coordinate(51.5074, -0.1278) is False


def test_enrich_companies_with_ai_empty() -> None:
    assert enrich_companies_with_ai([]) == []


@patch("pipeline.ai_enrichment.shutil.which", return_value="/fake/agy")
@patch("pipeline.ai_enrichment.subprocess.run")
def test_enrichment_discards_invalid_office_coordinates(mock_run: MagicMock, mock_which: MagicMock) -> None:
    mock_run.return_value = SimpleNamespace(stdout=json.dumps({"structured_output": {"companies": [{
        "name": "Example", "sector": "Software & SaaS", "size": "11-50", "offices": [{
            "address": "Example Street", "city": "Dublin", "latitude": 40.7128, "longitude": -74.006,
        }],
    }]}}), stderr="", returncode=0)

    assert enrich_companies_with_ai(["Example"], agy_path="/fake/agy")[0]["offices"] == []


def test_agy_fallback_uses_current_home() -> None:
    with (
        patch("pipeline.ai_enrichment.Path.home", return_value=Path("/synthetic/home")),
        patch("pipeline.ai_enrichment.shutil.which", side_effect=[None, "/synthetic/home/.local/bin/agy"]) as which,
    ):
        assert find_agy_binary() == "/synthetic/home/.local/bin/agy"
        assert which.call_args.args == ("/synthetic/home/.local/bin/agy",)


@patch("pipeline.ai_enrichment.shutil.which", return_value="/fake/agy")
@patch("pipeline.ai_enrichment.subprocess.run")
def test_enrich_companies_with_ai_mocked(mock_run: MagicMock, mock_which: MagicMock) -> None:
    sample_response = {
        "structured_output": {
            "companies": [
                {
                    "name": "Stripe",
                    "sector": "Fintech & Payments",
                    "size": "5000+",
                    "description": "Financial infrastructure platform for online commerce.",
                    "website": "https://stripe.com",
                    "offices": [
                        {
                            "name": "Stripe Dublin (EMEA HQ)",
                            "address": "One Wilton Park, Wilton Place, Dublin 2",
                            "city": "Dublin",
                            "eircode": "D02 FX04",
                            "latitude": 53.3338,
                            "longitude": -6.2485,
                        }
                    ],
                },
                {
                    "name": "Remote Only Co",
                    "sector": "Software & SaaS",
                    "size": "51-200",
                    "description": "Distributed cloud software company.",
                    "website": "https://example.com",
                    "offices": [],
                },
            ]
        }
    }

    mock_run.return_value = SimpleNamespace(
        stdout=json.dumps(sample_response),
        stderr="",
        returncode=0,
    )

    enriched = enrich_companies_with_ai(["Stripe", "Remote Only Co"], agy_path="/fake/agy")

    assert len(enriched) == 2
    stripe = enriched[0]
    assert stripe["name"] == "Stripe"
    assert stripe["sector"] == "Fintech & Payments"
    assert stripe["size"] == "5000+"
    assert stripe["website_domain"] == "stripe.com"
    assert len(stripe["offices"]) == 1

    office = stripe["offices"][0]
    assert office["name"] == "Stripe Dublin (EMEA HQ)"
    assert "One Wilton Park" in office["address"]
    assert office["city"] == "Dublin"
    assert office.get("eircode") == "D02 FX04"
    assert office["country_code"] == "IE"
    assert office["latitude"] == 53.3338
    assert office["longitude"] == -6.2485
    assert office["place_id"].startswith("ie-office-stripe-")

    remote = enriched[1]
    assert remote["name"] == "Remote Only Co"
    assert remote["size"] == "51-200"
    assert remote["offices"] == []


def test_apply_company_enrichment_dry_run() -> None:
    mock_client = MagicMock()
    employer = {
        "id": 101,
        "name": "Stripe",
        "sector": "Uncategorized",
        "size": None,
        "website": None,
        "description": None,
        "metadata_source": "unverified",
    }
    enriched = {
        "name": "Stripe",
        "sector": "Fintech & Payments",
        "size": "5000+",
        "description": "Payments infrastructure.",
        "website": "https://stripe.com",
        "website_domain": "stripe.com",
        "offices": [
            {
                "place_id": "ie-office-stripe-wilton",
                "name": "Stripe Dublin HQ",
                "address": "One Wilton Park",
                "city": "Dublin",
                "country_code": "IE",
                "latitude": 53.3338,
                "longitude": -6.2485,
            }
        ],
    }

    result = apply_company_enrichment(mock_client, employer, enriched, dry_run=True)

    assert result["id"] == 101
    assert result["sector"] == "Fintech & Payments"
    assert result["size"] == "5000+"
    assert result["office_leads_count"] == 1
    assert result["applied"] is False

    # Dry run must not perform writes
    mock_client.table.assert_not_called()
