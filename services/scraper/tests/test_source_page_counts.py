"""Facet probes and overlapping pages count unique vacancies while retaining hydration."""

from unittest.mock import MagicMock

from jobpulse_scraper.contracts import FetchResponse, RawJob, SourceAdapter
from jobpulse_scraper.runtime import queue as runtime


def test_overlap_counts_unique_urls_and_still_persists_richer_page(monkeypatch):
    url = "https://synthetic.invalid/jobs/one"
    task = runtime.CrawlTask(
        id="synthetic-task",
        source_key="synthetic-source",
        lease_token="synthetic-lease",
        target={"employer": "Synthetic", "url": "https://synthetic.invalid", "provider": "synthetic"},
        attempt=1,
    )
    transport = MagicMock()
    transport.fetch.side_effect = [
        FetchResponse(url, 200, b"listing"),
        FetchResponse(url, 200, b"complete published description"),
    ]
    adapter = SourceAdapter(
        lambda target, response: [
            RawJob(
                title="Platform Engineer",
                company=target.company,
                url=url,
                source=target.company,
                description=response.body.decode(),
            )
        ],
        lambda target: target.url,
        lambda target, response, page: url if page == 0 else None,
        max_pages=2,
    )
    monkeypatch.setitem(runtime.ADAPTERS, "synthetic", adapter)
    monkeypatch.setattr(runtime, "HttpTransport", lambda: transport)
    monkeypatch.setattr(runtime, "RecordingTransport", lambda transport, *args: transport)
    save = MagicMock(return_value=1)
    monkeypatch.setattr(runtime, "save_jobs_batch", save)
    monkeypatch.setattr(runtime, "update_employer_status", MagicMock())
    result = runtime.execute_task(task)
    assert result["status"] == "complete"
    assert result["found"] == 1
    assert result["persisted"] == 2
    assert save.call_count == 2
    assert save.call_args.args[0][0]["description"] == "complete published description"
