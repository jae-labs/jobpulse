"""Discovery preserves terminal blocks instead of trying extra routes."""

from email.message import Message
from unittest.mock import patch
from urllib.error import HTTPError

import pytest

from jobpulse_scraper.network.request_policy import ContentChallenge
from jobpulse_scraper.scrapers.generic.discovery import discover_employer_careers


def test_explicit_content_challenge_stops_before_homepage_fallback():
    error = ContentChallenge("https://synthetic.invalid/careers", 202)
    with patch("jobpulse_scraper.scrapers.generic.discovery.fetch_url_with_final", side_effect=error) as fetch:
        with pytest.raises(ContentChallenge) as caught:
            discover_employer_careers("Synthetic", "https://synthetic.invalid/careers")
    assert caught.value is error
    assert fetch.call_count == 1


def test_homepage_denial_is_not_hidden_by_initial_missing_page():
    missing = HTTPError("https://synthetic.invalid/careers", 404, "Synthetic missing", Message(), None)
    denied = HTTPError("https://synthetic.invalid", 429, "Synthetic denial", Message(), None)
    with patch(
        "jobpulse_scraper.scrapers.generic.discovery.fetch_url_with_final", side_effect=[missing, denied]
    ) as fetch:
        with pytest.raises(HTTPError) as caught:
            discover_employer_careers("Synthetic", "https://synthetic.invalid/careers")
    assert caught.value is denied
    assert fetch.call_count == 2


def test_discovery_does_not_fetch_same_listing_url_twice():
    page = """<a href="/jobs">View jobs</a><a href="/jobs/">Open positions</a>"""
    with patch(
        "jobpulse_scraper.scrapers.generic.discovery.fetch_url_with_final",
        return_value=("https://synthetic.invalid/jobs", page),
    ) as fetch:
        result = discover_employer_careers("Synthetic", "https://synthetic.invalid/jobs")
    assert result == ("https://synthetic.invalid/jobs", page)
    assert fetch.call_count == 1


def test_discovery_skips_a_candidate_that_redirected_to_a_visited_page():
    root = """<a href="/careers">Careers</a>"""
    with patch(
        "jobpulse_scraper.scrapers.generic.discovery.fetch_url_with_final",
        side_effect=[
            ("https://synthetic.invalid/", root),
        ],
    ) as fetch:
        result = discover_employer_careers("Synthetic", "https://synthetic.invalid/missing")
    assert result == ("https://synthetic.invalid/", root)
    assert fetch.call_count == 1
