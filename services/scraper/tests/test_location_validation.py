"""Presentation locales never establish or contradict published vacancy geography."""

import pytest

from jobpulse_scraper.engine.validators import is_valid_location


@pytest.mark.parametrize("locale", ["en-US", "fr-CA", "pt-BR", "en_US"])
def test_language_region_route_is_not_foreign_job_evidence(locale):
    assert is_valid_location("Ireland", "Synthetic Engineer", f"https://synthetic.invalid/{locale}/jobs/7")


@pytest.mark.parametrize("location", ["Austin, Texas", "Toronto, Canada", "Dublin, OH"])
def test_locale_handling_keeps_real_foreign_location_denial(location):
    assert not is_valid_location(location, "Synthetic Engineer", "https://synthetic.invalid/en-US/jobs/7")


def test_geographic_us_state_route_remains_foreign_evidence():
    assert not is_valid_location("Ireland", "Synthetic Engineer", "https://synthetic.invalid/us-mn/jobs/7")


def test_query_parameter_names_do_not_imply_us_state_geography():
    assert is_valid_location("Ireland", "Synthetic Engineer", "https://jobsireland.ie/en-US/job-Details?id=7")
    assert not is_valid_location("Austin, Texas", "Synthetic Engineer", "https://jobsireland.ie/en-US/job-Details?id=7")
