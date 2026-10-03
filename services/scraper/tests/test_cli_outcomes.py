"""Operator automation must detect incomplete ingestion by exit status."""

from unittest.mock import Mock

import pytest

import app


@pytest.mark.parametrize("status,exit_code", [("complete", 0), ("incomplete", 1)])
def test_cli_exit_reports_ingestion_outcome(monkeypatch, capsys, status, exit_code):
    monkeypatch.setattr("sys.argv", ["scraper", "--core-only"])
    monkeypatch.setattr(app, "sync_watchlist_metadata", Mock())
    monkeypatch.setattr(app, "synchronize", Mock(return_value={"status": status, "added": 2}))
    with pytest.raises(SystemExit) as result:
        app.main()
    assert result.value.code == exit_code
    if exit_code:
        assert "failed sources require retry" in capsys.readouterr().out
