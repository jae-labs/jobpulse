"""JobStash aggregator: Irish-only extraction."""

from __future__ import annotations

from scrapers.core.jobstash import extract_jobstash_items


def test_extract_jobstash_filters_ireland() -> None:
    items = [
        {
            "title": "Engineer",
            "organization": {"name": "Acme"},
            "location": "Dublin, Ireland",
            "url": "https://jobstash.xyz/jobs/1/details",
            "description": "Dublin role.",
        },
        {
            "title": "US Role",
            "organization": {"name": "Other"},
            "location": "New York, United States",
            "url": "https://jobstash.xyz/jobs/2/details",
        },
    ]
    opportunities = extract_jobstash_items(items)
    assert len(opportunities) == 1
    assert opportunities[0]["company"] == "Acme"
    assert opportunities[0]["source"] == "JobStash"


def test_extract_jobstash_uses_short_uuid_when_url_missing() -> None:
    items = [{"title": "Analyst", "organization": {"name": "Acme"}, "location": "Cork, Ireland", "shortUUID": "abc"}]
    opportunities = extract_jobstash_items(items)
    assert len(opportunities) == 1
    assert opportunities[0]["url"] == "https://jobstash.xyz/jobs/abc/details"


def test_partial_feed_failure_preserves_count_and_reports_incomplete(monkeypatch):
    import json
    from unittest.mock import Mock

    import pytest

    from database.repository import IngestionIncompleteError
    from scrapers.core import jobstash

    responses = iter(
        [
            json.dumps(
                {"data": [{"title": "Role", "location": "Dublin, Ireland", "url": "https://example.invalid/job"}] * 200}
            )
        ]
    )

    def fetch(url):
        try:
            return next(responses)
        except StopIteration:
            raise OSError("Page two failed") from None

    status = Mock()
    monkeypatch.setattr(jobstash, "fetch_page", fetch)
    monkeypatch.setattr(jobstash, "save_jobs_batch", lambda *args, **kwargs: 7)
    monkeypatch.setattr(jobstash, "update_source_status", status)
    with pytest.raises(IngestionIncompleteError) as failure:
        jobstash.sync_jobstash()
    assert failure.value.persisted == 7
    assert status.call_args.args[1] == "Failed"
