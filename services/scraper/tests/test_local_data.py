"""Persistent company dataset relocation preserves state and refuses unsafe moves."""

import fcntl
import sqlite3
import subprocess

import pytest

from jobpulse_scraper import local_data
from jobpulse_scraper.paths import COMPANY_INDEX_ROOT, COMPANY_RESEARCH_ROOT, REPO_ROOT


def test_company_databases_and_sidecars_are_git_ignored():
    paths = [
        COMPANY_INDEX_ROOT / "companies.sqlite3",
        COMPANY_INDEX_ROOT / "companies.sqlite3-wal",
        COMPANY_INDEX_ROOT / "companies.sqlite3-shm",
        COMPANY_RESEARCH_ROOT / "proposals.sqlite3",
        COMPANY_RESEARCH_ROOT / "proposals.sqlite3-wal",
        COMPANY_RESEARCH_ROOT / "campaigns/synthetic/report.json",
    ]
    names = [str(path.relative_to(REPO_ROOT)) for path in paths]
    result = subprocess.run(
        ["git", "check-ignore", "--stdin"],
        input="\n".join(names) + "\n",
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.splitlines() == names


def test_complete_directory_moves_without_download_or_data_loss(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "data/index"
    legacy.mkdir()
    with sqlite3.connect(legacy / "companies.sqlite3") as connection:
        connection.execute("CREATE TABLE synthetic (id INTEGER PRIMARY KEY)")
        connection.execute("INSERT INTO synthetic VALUES (7)")
    (legacy / "companies.sqlite3-wal").write_bytes(b"synthetic sidecar")
    (legacy / "companies.csv.zip").write_bytes(b"synthetic snapshot")
    (legacy / "reports").mkdir()
    (legacy / "reports/lead.json").write_text("{}")
    inode = (legacy / "companies.sqlite3").stat().st_ino
    local_data.relocate_directory(legacy, target, tmp_path / "data")
    assert not legacy.exists()
    assert (target / "companies.sqlite3").stat().st_ino == inode
    assert (target / "companies.sqlite3-wal").read_bytes() == b"synthetic sidecar"
    assert (target / "companies.csv.zip").read_bytes() == b"synthetic snapshot"
    assert (target / "reports/lead.json").read_text() == "{}"
    # Test the moved database independently from the opaque sidecar retention assertion.
    (target / "companies.sqlite3-wal").unlink()
    with sqlite3.connect(target / "companies.sqlite3") as connection:
        assert connection.execute("SELECT id FROM synthetic").fetchall() == [(7,)]
    local_data.relocate_directory(legacy, target, tmp_path / "data")


def test_collision_preserves_both_directories(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "data/index"
    legacy.mkdir()
    target.mkdir(parents=True)
    (legacy / "record").write_text("old")
    (target / "record").write_text("new")
    with pytest.raises(FileExistsError):
        local_data.relocate_directory(legacy, target, tmp_path / "data")
    assert (legacy / "record").read_text() == "old"
    assert (target / "record").read_text() == "new"


def test_active_writer_refuses_move_then_recovers(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "data/index"
    legacy.mkdir()
    with (legacy / "import.lock").open("a") as writer:
        fcntl.flock(writer, fcntl.LOCK_EX)
        with pytest.raises(RuntimeError, match="Stop active"):
            local_data.relocate_directory(legacy, target, tmp_path / "data")
        assert legacy.exists() and not target.exists()
    local_data.relocate_directory(legacy, target, tmp_path / "data")
    assert target.exists()


def test_concurrent_relocation_guard_fails_fast(tmp_path):
    legacy, guard = tmp_path / "legacy", tmp_path / "data"
    legacy.mkdir()
    guard.mkdir()
    with (guard / ".company-data-move.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with pytest.raises(RuntimeError, match="busy"):
            local_data.relocate_directory(legacy, guard / "index", guard)
    assert legacy.exists()


@pytest.mark.parametrize("location", ["legacy", "destination", "guard"])
def test_symlink_directories_are_not_relocated(tmp_path, location):
    real = tmp_path / "real"
    real.mkdir()
    legacy, target, guard = tmp_path / "legacy", tmp_path / "data/index", tmp_path / "data"
    legacy.mkdir()
    if location == "legacy":
        legacy.rmdir()
        legacy.symlink_to(real, target_is_directory=True)
    elif location == "destination":
        guard.mkdir()
        target.symlink_to(real, target_is_directory=True)
    else:
        guard.symlink_to(real, target_is_directory=True)
    with pytest.raises(ValueError, match="real directories"):
        local_data.relocate_directory(legacy, target, guard)
    assert real.exists() and legacy.exists()


def test_only_default_roots_relocate_and_recovery_exports_stay(tmp_path, monkeypatch):
    index = tmp_path / ".data/company-index"
    proposals = tmp_path / ".data/company-research"
    monkeypatch.setattr(local_data, "COMPANY_INDEX_ROOT", index)
    monkeypatch.setattr(local_data, "COMPANY_RESEARCH_ROOT", proposals)
    monkeypatch.setattr(local_data, "DATA_ROOT", tmp_path / ".data")
    monkeypatch.setattr(local_data, "REPO_ROOT", tmp_path)
    legacy = tmp_path / ".backups/company-index"
    legacy.mkdir(parents=True)
    recovery = tmp_path / ".backups/jobpulse-synthetic"
    recovery.mkdir()
    local_data.prepare_company_root(tmp_path / "custom")
    assert legacy.exists()
    local_data.prepare_company_root(index)
    assert not legacy.exists() and index.exists() and recovery.exists()
