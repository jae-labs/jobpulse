"""Candidate evaluation happens once after successful vacancy ingestion."""

from unittest.mock import Mock

import pytest

from pipeline import runner


def test_scoring_runs_after_ingestion_once_for_all_entry_points(monkeypatch) -> None:
    events = []
    scrape = Mock(side_effect=lambda *args: events.append("ingestion") or {"added": 4})
    score = Mock(side_effect=lambda **kwargs: events.append("scoring") or 12)
    monkeypatch.setattr(runner, "_scrape", scrape)
    monkeypatch.setattr(runner, "rescore_all_jobs", score)
    result = runner.synchronize(employer="Example", user_id="candidate")
    assert events == ["ingestion", "scoring"]
    assert result == {"added": 4, "evaluations_updated": 12}
    score.assert_called_once_with(user_id="candidate")


def test_no_rescore_skips_candidate_work(monkeypatch) -> None:
    monkeypatch.setattr(runner, "_scrape", lambda *args: {"added": 4})
    score = Mock(side_effect=AssertionError("Scoring disabled"))
    monkeypatch.setattr(runner, "rescore_all_jobs", score)
    assert runner.synchronize(rescore=False)["evaluations_updated"] == 0
    score.assert_not_called()


def test_scoring_failure_does_not_repeat_ingestion(monkeypatch) -> None:
    scrape = Mock(return_value={"added": 4})
    monkeypatch.setattr(runner, "_scrape", scrape)
    monkeypatch.setattr(runner, "rescore_all_jobs", Mock(side_effect=RuntimeError("scoring unavailable")))
    with pytest.raises(RuntimeError, match="scoring unavailable"):
        runner.synchronize()
    scrape.assert_called_once()
