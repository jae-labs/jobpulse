"""Replay preserves published facts without networking and rejects unsafe storage."""

import json

import pytest

from jobpulse_scraper.contracts import FetchResponse, SourceTarget
from jobpulse_scraper.snapshots import MAX_BODY_BYTES, SnapshotStore, public_url


def test_replay_checksum_and_no_network(tmp_path):
    store = SnapshotStore(tmp_path)
    target = SourceTarget("greenhouse", "Synthetic", "https://example.invalid", "synthetic")
    body = json.dumps(
        {"jobs": [{"id": 1, "title": "Engineer", "location": {"name": "Dublin"}, "content": "Published duties."}]}
    ).encode()
    key = store.save(target, FetchResponse(target.url, 200, body))
    jobs = store.replay(key)
    assert len(jobs) == 1 and jobs[0].title == "Engineer"
    assert store.save(target, FetchResponse(target.url, 200, body)) == key
    next(tmp_path.glob("*.bin")).write_bytes(b"tampered")
    with pytest.raises(ValueError, match="checksum"):
        store.replay(key)


@pytest.mark.parametrize("key", ["../file", "/etc/passwd", "a" * 64 + ".txt"])
def test_replay_rejects_path_escape(tmp_path, key):
    with pytest.raises(ValueError):
        SnapshotStore(tmp_path).replay(key)


def test_snapshot_size_and_credentials(tmp_path):
    store = SnapshotStore(tmp_path)
    target = SourceTarget("jsonld", "Synthetic", "https://example.invalid")
    with pytest.raises(ValueError, match="budget"):
        store.save(target, FetchResponse(target.url, 200, b"x" * (MAX_BODY_BYTES + 1)))
    with pytest.raises(ValueError, match="uncredentialed"):
        public_url("https://user:secret@example.invalid/jobs")
    assert public_url("https://example.invalid/jobs?id=1&token=secret") == "https://example.invalid/jobs?id=1"


def test_snapshot_symlink_is_rejected(tmp_path):
    link = tmp_path / "link"
    link.symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(ValueError, match="symbolic"):
        SnapshotStore(link)


def test_concurrent_snapshots_respect_shared_storage_budget(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    from jobpulse_scraper import snapshots

    monkeypatch.setattr(snapshots, "MAX_STORE_BYTES", 1500)
    store = snapshots.SnapshotStore(tmp_path)
    target = SourceTarget("jsonld", "Synthetic", "https://example.invalid")

    def save(number):
        try:
            return store.save(target, FetchResponse(target.url, 200, bytes([number]) * 512))
        except ValueError:
            return None

    with ThreadPoolExecutor(max_workers=4) as workers:
        results = list(workers.map(save, range(4)))
    assert any(result is not None for result in results)
    assert any(result is None for result in results)
    assert sum(path.stat().st_size for path in tmp_path.iterdir()) <= 1500


def test_snapshot_retention_expires_old_public_responses(tmp_path):
    import os
    import time

    store = SnapshotStore(tmp_path)
    target = SourceTarget("jsonld", "Synthetic", "https://example.invalid")
    key = store.save(target, FetchResponse(target.url, 200, b"old"))
    for path in tmp_path.iterdir():
        expired = time.time() - 31 * 86400
        os.utime(path, (expired, expired))
    store.save(target, FetchResponse(target.url, 200, b"new"))
    assert not (tmp_path / key).exists()
