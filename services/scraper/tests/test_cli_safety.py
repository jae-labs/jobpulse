"""Retired destructive commands must fail before reaching ingestion or database work."""

from unittest.mock import Mock

import pytest

import app


def test_retired_pruning_command_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    synchronize = Mock()
    metadata = Mock()
    monkeypatch.setattr("sys.argv", ["app.py", "--prune-only"])
    monkeypatch.setattr(app, "synchronize", synchronize)
    monkeypatch.setattr(app, "sync_watchlist_metadata", metadata)

    with pytest.raises(SystemExit) as exit_info:
        app.main()

    assert exit_info.value.code == 2
    synchronize.assert_not_called()
    metadata.assert_not_called()
