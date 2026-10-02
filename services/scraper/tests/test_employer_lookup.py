"""Unit tests for employer lookup, location enrichment, and geocoding."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

from pipeline.employer_lookup import (
    CURATED_IRISH_EMPLOYERS,
    EmployerLookupService,
    _infer_sector_from_description,
    normalize_company_key,
)


def test_normalize_company_key() -> None:
    assert normalize_company_key("Stripe, Inc.") == "stripe"
    assert normalize_company_key("Kildare County Council") == "kildare county council"
    assert normalize_company_key("AIB Group plc") == "aib"
    assert normalize_company_key("Workday Limited") == "workday"
    assert normalize_company_key("Google Ireland Ltd") == "google"
    assert normalize_company_key("") == ""


def test_curated_irish_employers_presence() -> None:
    assert "kildare county council" in CURATED_IRISH_EMPLOYERS
    kildare = CURATED_IRISH_EMPLOYERS["kildare county council"]
    assert kildare["sector"] == "Public service"
    assert "Kildare" in kildare["location"]
    assert kildare["latitude"] is not None
    assert kildare["longitude"] is not None

    assert "maynooth university" in CURATED_IRISH_EMPLOYERS
    maynooth = CURATED_IRISH_EMPLOYERS["maynooth university"]
    assert maynooth["sector"] == "Higher education"
    assert "Maynooth" in maynooth["location"]

    assert "stripe" in CURATED_IRISH_EMPLOYERS
    stripe = CURATED_IRISH_EMPLOYERS["stripe"]
    assert stripe["sector"] == "FinTech & Payments"
    assert "Dublin" in stripe["location"]


def test_infer_sector_from_description() -> None:
    assert _infer_sector_from_description("Local government authority for county") == "Public service"
    assert _infer_sector_from_description("Constituent university of Ireland") == "Higher education"
    assert _infer_sector_from_description("Online payments and fintech company") == "Financial services"
    assert _infer_sector_from_description("Global biopharmaceutical and pharma firm") == "Life sciences"
    assert _infer_sector_from_description("Semiconductor manufacturer chip designer") == "Semiconductors & Hardware"
    assert _infer_sector_from_description("Enterprise cloud software platform") == "Technology & Software"
    assert _infer_sector_from_description("Supermarket grocery retail store") == "Retail"
    assert _infer_sector_from_description("National airline flight transport") == "Transport & Logistics"


def test_resolve_curated_employer(monkeypatch: Any) -> None:
    service = EmployerLookupService()
    # Mock database to return empty so it hits curated fallback
    monkeypatch.setattr(service, "lookup_employer_in_db", lambda name: None)

    mock_supabase = MagicMock()
    mock_supabase.table().insert().execute.return_value = MagicMock(
        data=[
            {
                "id": 42,
                "name": "Kildare County Council",
                "sector": "Public service",
                "location": "Naas, Co. Kildare, Ireland",
                "latitude": 53.1762795,
                "longitude": -6.7987535,
            }
        ]
    )
    monkeypatch.setattr(service, "_supabase", mock_supabase)

    resolved = service.resolve_employer("Kildare County Council")
    assert resolved is not None
    assert resolved["name"] == "Kildare County Council"
    assert resolved["sector"] == "Public service"
    assert "Kildare" in resolved["location"]


def test_cached_resolution(monkeypatch: Any) -> None:
    service = EmployerLookupService()
    db_calls = 0

    def mock_lookup(name: str) -> dict[str, Any]:
        nonlocal db_calls
        db_calls += 1
        return {
            "id": 99,
            "name": name,
            "sector": "Technology",
            "location": "Dublin, Ireland",
            "latitude": 53.34,
            "longitude": -6.26,
        }

    monkeypatch.setattr(service, "lookup_employer_in_db", mock_lookup)

    res1 = service.resolve_employer("Custom Test Company")
    res2 = service.resolve_employer("Custom Test Company")

    assert res1 == res2
    assert db_calls == 1  # Second call served from memory cache


def test_save_jobs_batch_enriches_location_and_coordinates(monkeypatch: Any) -> None:
    from database.repository import save_jobs_batch

    fake_employer = {
        "id": 501,
        "name": "Kildare County Council",
        "sector": "Public service",
        "location": "Naas, Co. Kildare, Ireland",
        "latitude": 53.1762795,
        "longitude": -6.7987535,
    }

    mock_service = MagicMock()
    mock_service.resolve_employer.return_value = fake_employer

    with patch("database.repository.get_employer_lookup_service", return_value=mock_service):
        captured_chunk: list[dict[str, Any]] = []

        def mock_retry(call: Any) -> Any:
            nonlocal captured_chunk
            # The lambda in save_jobs_batch does supabase.table("jobs").upsert(...)
            mock_res = MagicMock()
            mock_res.data = []
            return mock_res

        mock_supabase = MagicMock()
        mock_supabase.table().select().in_().execute.return_value = MagicMock(data=[])

        def fake_upsert(chunk: list[dict[str, Any]], **kwargs: Any) -> Any:
            nonlocal captured_chunk
            captured_chunk = list(chunk)
            m = MagicMock()
            m.execute.return_value = MagicMock(data=chunk)
            return m

        mock_supabase.table().upsert = fake_upsert

        with (
            patch("database.repository.get_supabase", return_value=mock_supabase),
            patch("database.repository.retry_supabase", side_effect=lambda fn: fn()),
            patch("database.repository.prepare_embeddings", return_value=None),
        ):
            jobs_to_save = [
                {
                    "title": "Civil Engineer",
                    "company": "Kildare County Council",
                    "location": "Hybrid",  # Vague location
                    "description": (
                        "Detailed civil engineering duties and infrastructure project management in County Kildare. "
                        "The candidate will lead county road planning, drainage works, and bridge inspections."
                    ),
                    "url": "https://kildarecoco.ie/jobs/civil-eng-1",
                    "source": "Kildare County Council",
                }
            ]

            added = save_jobs_batch(jobs_to_save, enrich=False)
            assert added == 1
            assert len(captured_chunk) == 1

            saved = captured_chunk[0]
            assert saved["employer_id"] == 501
            assert saved["latitude"] == 53.1762795
            assert saved["longitude"] == -6.7987535
            # Vague "Hybrid" was enriched with employer location and work mode preserved
            assert "Naas, Co. Kildare, Ireland (Hybrid)" in saved["location"]
