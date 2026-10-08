"""Company discovery is additive evidence; never invent a vacancy address."""

import pytest

from jobpulse_scraper.pipeline.employer_offices import DETAILS_API, PLACES_API, discover_offices, website_domain


class Provider:
    def __init__(self, features=None, regions=None, website="https://example.invalid"):
        self.calls = []
        self.regions = (
            regions
            if regions is not None
            else [{"place_id": "city-id", "result_type": "city", "rank": {"confidence": 1}}]
        )
        self.features = features if features is not None else [office()]
        self.website = website

    def get(self, url, params):
        self.calls.append((url, params))
        if url == PLACES_API:
            assert params["filter"] == "place:city-id"
            return {"features": self.features}
        if url == DETAILS_API:
            return {"features": [{"properties": {"website": self.website}}]}
        return {"results": self.regions}


def office(**changes):
    return {
        "properties": {
            "name": "Example Ltd",
            "place_id": "office-id",
            "lat": 0,
            "lon": 0,
            "street": "Synthetic Street",
            "housenumber": "1",
            "formatted": "1 Synthetic Street, Dublin",
            "city": "Dublin",
            "country_code": "ie",
            "categories": ["office.it"],
            **changes,
        }
    }


EMPLOYER = {"employer_id": 1, "name": "Example Ltd", "location": "Dublin", "website": "https://example.invalid"}


def test_company_place_keeps_provenance_address_domain_and_zero_coordinates():
    result = discover_offices(Provider(), EMPLOYER, "secret")
    assert result["status"] == "found"
    assert result["offices"][0]["website_domain"] == "example.invalid"
    assert result["offices"][0]["latitude"] == 0
    assert result["location"] == "Dublin"  # original vacancy place remains unchanged
    assert "secret" not in str(result)


@pytest.mark.parametrize(
    "changes",
    [{"name": "Example Other"}, {"street": None}, {"housenumber": None}, {"lat": True}, {"lon": float("inf")}],
)
def test_partial_names_and_incomplete_addresses_are_unresolved(changes):
    assert discover_offices(Provider([office(**changes)]), EMPLOYER, "secret")["status"] == "unresolved"


def test_conflicting_website_is_not_same_company():
    assert discover_offices(Provider(website="https://another.invalid"), EMPLOYER, "secret")["status"] == "unresolved"


def test_multiple_offices_are_retained_without_selecting_a_workplace():
    result = discover_offices(Provider([office(), office(place_id="second", housenumber="2")]), EMPLOYER, "secret")
    assert len(result["offices"]) == 2
    assert "latitude" not in result


def test_ambiguous_city_stops_before_business_search():
    provider = Provider(regions=[{"rank": {"confidence": 1}}, {"rank": {"confidence": 1}}])
    assert discover_offices(provider, EMPLOYER, "secret")["status"] == "ambiguous"
    assert len(provider.calls) == 1


def test_remote_and_placeholder_do_not_call_provider():
    provider = Provider()
    assert discover_offices(provider, {**EMPLOYER, "location": "Remote"}, "secret")["status"] == "remote"
    assert discover_offices(provider, {**EMPLOYER, "name": "Confidential"}, "secret")["status"] == "unresolved"
    assert not provider.calls


@pytest.mark.parametrize(
    "value", ["https://[", "https://127.0.0.1", "javascript:alert(1)", "https://u:p@example.invalid", None]
)
def test_unsafe_website_is_not_stored(value):
    assert website_domain(value) is None


def test_office_stage_failure_does_not_fail_scrape_or_location_verification(monkeypatch):
    from jobpulse_scraper.pipeline import runner

    monkeypatch.setenv("GEOAPIFY_API_KEY", "synthetic")
    monkeypatch.setattr(runner, "_scrape", lambda *args: {"added": 3})
    monkeypatch.setattr(
        "jobpulse_scraper.pipeline.employer_offices.enrich_offices",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError()),
    )
    monkeypatch.setattr(
        "jobpulse_scraper.pipeline.job_locations.verify_catalog_locations", lambda **kwargs: {"updated": 2}
    )
    result = runner.synchronize()
    assert result == {"added": 3, "employer_offices": {"failed": 1}, "locations": {"updated": 2}}


@pytest.mark.parametrize(
    "features", [[None], [{"properties": None}], [office(name=None)], [office(categories="office.it")]]
)
def test_malformed_provider_results_are_retryable(features):
    from jobpulse_scraper.pipeline.company_research import ResearchError

    with pytest.raises(ResearchError):
        discover_offices(Provider(features), EMPLOYER, "secret")
