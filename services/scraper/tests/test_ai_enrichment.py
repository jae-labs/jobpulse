"""Unit tests for AI-powered company and Ireland office enrichment."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from jobpulse_scraper.pipeline.ai_enrichment import (
    ENRICHMENT_SCHEMA,
    VALID_SIZES,
    enrich_companies_with_ai,
    extract_domain,
    find_agy_binary,
    is_valid_ireland_coordinate,
    slugify_name,
)
from tools import research_companies as proposals


@pytest.fixture
def proposal_client(monkeypatch, tmp_path) -> MagicMock:
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        {"id": 7, "name": "Example"}
    ]
    monkeypatch.setattr(proposals, "get_supabase", lambda: client)
    monkeypatch.setattr(proposals, "active_employers", lambda client: [{"id": 7, "name": "Example"}])
    monkeypatch.setattr(proposals, "CACHE_ROOT", tmp_path / "cache")
    return client


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


@pytest.mark.parametrize("size", ["11-50", None, "invented"])
@patch("jobpulse_scraper.pipeline.ai_enrichment.shutil.which", return_value="/fake/agy")
@patch("jobpulse_scraper.pipeline.ai_enrichment.subprocess.run")
def test_enrichment_discards_invalid_office_coordinates(
    mock_run: MagicMock, mock_which: MagicMock, size: str | None
) -> None:
    mock_run.return_value = SimpleNamespace(
        stdout=json.dumps(
            {
                "structured_output": {
                    "companies": [
                        {
                            "name": "Example",
                            "sector": "Software & SaaS",
                            "size": size,
                            "offices": [
                                {
                                    "address": "Example Street",
                                    "city": "Dublin",
                                    "latitude": 40.7128,
                                    "longitude": -74.006,
                                }
                            ],
                        }
                    ]
                }
            }
        ),
        stderr="",
        returncode=0,
    )

    proposal = enrich_companies_with_ai(["Example"], agy_path="/fake/agy")[0]
    assert proposal["offices"] == []
    assert proposal["size"] == (size if size in VALID_SIZES else "")


def test_agy_fallback_uses_current_home() -> None:
    with (
        patch("jobpulse_scraper.pipeline.ai_enrichment.Path.home", return_value=Path("/synthetic/home")),
        patch(
            "jobpulse_scraper.pipeline.ai_enrichment.shutil.which", side_effect=[None, "/synthetic/home/.local/bin/agy"]
        ) as which,
    ):
        assert find_agy_binary() == "/synthetic/home/.local/bin/agy"
        assert which.call_args.args == ("/synthetic/home/.local/bin/agy",)


@patch("jobpulse_scraper.pipeline.ai_enrichment.shutil.which", return_value="/fake/agy")
@patch("jobpulse_scraper.pipeline.ai_enrichment.subprocess.run")
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
    command = mock_run.call_args.args[0]
    assert json.loads(command[command.index("--json-schema") + 1]) == ENRICHMENT_SCHEMA

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


def test_retired_apply_flag_is_rejected_before_database_access(monkeypatch) -> None:
    monkeypatch.setattr("sys.argv", ["company-proposals", "--apply", "--report", "/tmp/unused.json"])
    monkeypatch.setattr(proposals, "get_supabase", lambda: pytest.fail("Connected before rejecting unsafe flag"))
    with pytest.raises(SystemExit) as outcome:
        proposals.main()
    assert outcome.value.code == 2


def test_proposals_never_write_catalog_and_require_exact_identity(monkeypatch, tmp_path, proposal_client) -> None:
    client = proposal_client
    monkeypatch.setattr(
        proposals,
        "enrich_companies_with_ai",
        lambda names, **kwargs: [{"name": "Example", "sector": "Unverified lead", "size": "", "offices": []}],
    )
    report = tmp_path / "proposals.json"
    monkeypatch.setattr("sys.argv", ["company-proposals", "--metadata-batch", "--report", str(report)])
    proposals.main()
    assert json.loads(report.read_text())["status"] == "unverified_proposals"
    client.table.return_value.update.assert_not_called()
    client.table.return_value.upsert.assert_not_called()
    monkeypatch.setattr(
        proposals,
        "enrich_companies_with_ai",
        lambda names, **kwargs: [{"name": "Example UK", "sector": "Unverified lead", "size": "", "offices": []}],
    )
    proposals.main()
    assert json.loads(report.read_text())["selection"]["cached_skipped"] == 1
    monkeypatch.setattr("sys.argv", ["company-proposals", "--metadata-batch", "--report", str(report), "--refresh"])
    with pytest.raises(SystemExit) as outcome:
        proposals.main()
    assert outcome.value.code == 1
    client.table.return_value.update.assert_not_called()


def test_company_research_failure_is_not_reported_as_success(monkeypatch, tmp_path, proposal_client) -> None:
    monkeypatch.setattr(
        proposals, "enrich_companies_with_ai", MagicMock(side_effect=RuntimeError("Synthetic provider failure"))
    )
    monkeypatch.setattr(
        "sys.argv", ["company-proposals", "--metadata-batch", "--report", str(tmp_path / "report.json")]
    )
    with pytest.raises(SystemExit) as outcome:
        proposals.main()
    assert outcome.value.code == 1
    assert not (tmp_path / "report.json").exists()
