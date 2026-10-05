"""CLI safety, configuration and ingestion outcome contracts."""

from unittest.mock import Mock

import pytest

import app
from config.loader import load_websites_config


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


def test_invalid_configuration_prints_issues_and_fails(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["scraper", "--validate-config"])
    monkeypatch.setattr(app, "load_websites_config", lambda: [])
    monkeypatch.setattr(app, "validate_websites_config", lambda _: ["Synthetic invalid source"])
    with pytest.raises(SystemExit) as result:
        app.main()
    assert result.value.code == 1
    assert "Synthetic invalid source" in capsys.readouterr().out


@pytest.mark.parametrize(
    "content",
    [
        "[",
        "{}",
        "[]",
        "websites: [broken]",
        "- name: Example\n  careers_url: https://example.invalid\n  enabled: 'false'",
        "- name: Example\n  careers_url: invalid",
    ],
)
def test_loader_rejects_malformed_configuration_without_empty_fallback(tmp_path, content):
    path = tmp_path / "websites.yaml"
    path.write_text(content)
    with pytest.raises(ValueError, match="Invalid source configuration"):
        load_websites_config(path)


def test_missing_configuration_cannot_fall_back_to_a_different_file(tmp_path):
    with pytest.raises(ValueError, match="Invalid source configuration"):
        load_websites_config(tmp_path / "missing.yaml")


def test_valid_configuration_retains_disabled_sources_and_defaults(tmp_path):
    path = tmp_path / "websites.yaml"
    path.write_text("- name: Example\n  careers_url: https://example.invalid\n  enabled: false")
    sources = load_websites_config(path)
    assert sources[0]["enabled"] is False and sources[0]["priority"] == 50
