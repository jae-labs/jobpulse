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


def test_snapshot_compaction_keeps_replay_keys_and_legacy_bodies(tmp_path, monkeypatch):
    from jobpulse_scraper import snapshots

    monkeypatch.setattr(snapshots, "MAX_STORE_BYTES", 1800)
    store = SnapshotStore(tmp_path)

    def save(company: str, filler: str) -> tuple[str, bytes]:
        target = SourceTarget("greenhouse", company, f"https://boards.greenhouse.io/{company.lower()}", company.lower())
        body = json.dumps(
            {
                "jobs": [
                    {
                        "id": company,
                        "title": f"{company} engineer",
                        "location": {"name": "Dublin, Ireland"},
                        "absolute_url": f"https://example.invalid/{company}",
                        "content": filler,
                    }
                ]
            }
        ).encode()
        return store.save(target, FetchResponse(target.url, 200, body)), body

    first_key, first_body = save("First", "A" * 900)
    first_metadata = json.loads((tmp_path / first_key).read_text())
    first_body_path = tmp_path / f"{first_metadata['body_hash']}.bin"
    assert first_body_path.read_bytes().startswith(snapshots._COMPRESSED_BODY_PREFIX)

    # Existing raw snapshots stay readable and can be compacted without changing their metadata key.
    first_body_path.write_bytes(first_body)
    second_key, second_body = save("Second", "B" * 900)
    second_metadata = json.loads((tmp_path / second_key).read_text())
    (tmp_path / f"{second_metadata['body_hash']}.bin").write_bytes(second_body)

    third_key, _ = save("Third", "C" * 900)
    assert (tmp_path / first_key).exists()
    assert (tmp_path / second_key).exists()
    assert (tmp_path / third_key).exists()
    assert sum(path.stat().st_size for path in tmp_path.iterdir()) <= snapshots.MAX_STORE_BYTES
    assert [job.title for job in store.replay(first_key)] == ["First engineer"]
    assert [job.title for job in store.replay(second_key)] == ["Second engineer"]
    assert [job.title for job in store.replay(third_key)] == ["Third engineer"]


def test_snapshot_symlink_is_rejected(tmp_path):
    link = tmp_path / "link"
    link.symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(ValueError, match="symbolic"):
        SnapshotStore(link)


def test_concurrent_snapshots_respect_shared_storage_budget(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    from jobpulse_scraper import snapshots

    monkeypatch.setattr(snapshots, "MAX_STORE_BYTES", 900)
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
