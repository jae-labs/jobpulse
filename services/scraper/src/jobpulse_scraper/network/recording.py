"""Snapshot capture composes with a transport and an injected metadata sink."""

from collections.abc import Callable

from jobpulse_scraper.contracts import FetchRequest, FetchResponse, SourceTarget, Transport
from jobpulse_scraper.snapshots import SnapshotStore


class RecordingTransport:
    def __init__(
        self,
        transport: Transport,
        target: SourceTarget,
        snapshots: SnapshotStore,
        record: Callable[[FetchResponse, str], None],
    ):
        self.transport, self.target, self.snapshots, self.record = transport, target, snapshots, record

    def fetch(self, url: str | FetchRequest) -> FetchResponse:
        response = self.transport.fetch(url)
        key = self.snapshots.save(self.target, response)
        self.record(response, key)
        return response
