"""Audit bounds and observations must never claim a measured blocking ceiling."""

import pytest

from tools import probe_request_limits as audit


@pytest.fixture(autouse=True)
def isolated_probe(monkeypatch):
    monkeypatch.setattr(audit.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(audit.gate, "observe", lambda *args: None)


def test_first_throttle_stops_samples(monkeypatch):
    replies = iter([(404, {}, ""), (200, {}, "jobs"), (429, {"retry-after": "60"}, "")])
    calls = []

    def request(url):
        calls.append(url)
        return next(replies)

    monkeypatch.setattr(audit, "request_once", request)
    result = audit.probe("https://example.invalid/jobs", samples=5)
    assert len(calls) == 3
    assert result["successful_samples"] == 1
    assert result["blocking_threshold"] is None
    assert result["outcome"] == "denied_or_throttled"


def test_robots_denial_sends_no_career_requests(monkeypatch):
    calls = []

    def request(url):
        calls.append(url)
        return 200, {}, "User-agent: *\nDisallow: /jobs"

    monkeypatch.setattr(audit, "request_once", request)
    assert audit.probe("https://example.invalid/jobs")["outcome"] == "robots_disallowed"
    assert len(calls) == 1


def test_accepted_sample_is_not_a_limit(monkeypatch):
    monkeypatch.setattr(audit, "request_once", lambda url: (200, {}, "User-agent: *\nCrawl-delay: 12"))
    result = audit.probe("https://example.invalid/jobs")
    assert result["interval_seconds"] == 12
    assert result["successful_samples"] == 3
    assert result["blocking_threshold"] is None
    assert result["outcome"] == "sample_accepted_limit_unknown"


def test_apply_preserves_slower_policy(monkeypatch, tmp_path):
    path = tmp_path / "policy.yaml"
    path.write_text(
        "defaults: {min_interval_seconds: 3, block_cooldown_seconds: 900}\n"
        "hosts: {example.invalid: {min_interval_seconds: 30}}"
    )
    audit.save_observations([{"host": "example.invalid", "interval_seconds": 5, "blocking_threshold": None}], path)
    policy = audit.load_policy(path)
    assert policy["hosts"]["example.invalid"]["min_interval_seconds"] == 30
    assert policy["hosts"]["example.invalid"]["last_observation"]["blocking_threshold"] is None


def test_challenge_with_200_is_not_success(monkeypatch):
    replies = iter([(404, {}, ""), (200, {}, "Please verify you are human")])
    monkeypatch.setattr(audit, "request_once", lambda url: next(replies))
    result = audit.probe("https://example.invalid/jobs")
    assert result["successful_samples"] == 0
    assert result["outcome"] == "possible_challenge"


@pytest.mark.parametrize("status", [301, 403, 503])
def test_robots_failure_stops_without_following_or_retrying(monkeypatch, status):
    monkeypatch.setattr(audit, "request_once", lambda url: (status, {}, ""))
    result = audit.probe("https://example.invalid/jobs")
    assert result["outcome"] == "robots_unavailable"
    assert len(result["responses"]) == 1
