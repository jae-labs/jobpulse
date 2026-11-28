"""Reusable task isolation with hard deadlines and process-group cancellation."""

from __future__ import annotations

import json
import multiprocessing
import os
import signal
import subprocess
import threading
from multiprocessing.connection import Connection
from typing import Any


class TaskCancelled(BaseException):
    """Worker interruption leaves its current lease available for crash recovery."""


def _serve(connection: Connection) -> None:
    if os.name == "posix":
        os.setsid()
    from jobpulse_scraper.database.repository import IngestionIncompleteError
    from jobpulse_scraper.network.experience import run_identity, run_key
    from jobpulse_scraper.network.ledger import source_key
    from jobpulse_scraper.runtime.lease import Lease, active_lease, active_snapshot
    from jobpulse_scraper.runtime.queue import CrawlTask, execute_task

    try:
        while True:
            payload = connection.recv()
            if payload is None:
                return
            task = CrawlTask.model_validate(payload)
            lease_token = active_lease.set(Lease(task.id, task.lease_token))
            source_token = source_key.set(task.source_key)
            snapshot_token = active_snapshot.set(None)
            run_token = run_key.set(run_identity(task.id, task.lease_token))
            try:
                try:
                    result = execute_task(task)
                except IngestionIncompleteError as error:
                    result = {
                        "status": "incomplete",
                        "persisted": error.persisted,
                        "failed_writes": error.failed,
                        "vectors_pending": error.vectors_pending,
                    }
                except Exception:
                    result = {"status": "incomplete", "error_code": "source_execution_failed"}
                if len(json.dumps(result).encode()) > 32768:
                    result = {"status": "incomplete", "error_code": "task_result_budget_exceeded"}
                connection.send(result)
            finally:
                active_lease.reset(lease_token)
                source_key.reset(source_token)
                active_snapshot.reset(snapshot_token)
                run_key.reset(run_token)
    except (EOFError, BrokenPipeError):
        return
    finally:
        connection.close()


class TaskProcess:
    def __init__(self, timeout_seconds: float = 120, *, entrypoint: Any = _serve):
        if not 0 < timeout_seconds <= 3600:
            raise ValueError("Task deadline must be positive and at most one hour")
        self.timeout = timeout_seconds
        self.entrypoint = entrypoint
        self.process: Any = None
        self.connection: Connection | None = None
        self.lock = threading.RLock()
        self.cancelled = threading.Event()

    def execute(self, task: Any) -> dict[str, Any]:
        with self.lock:
            if self.cancelled.is_set():
                raise TaskCancelled()
            if self.process is None:
                context = multiprocessing.get_context("spawn")
                parent, child = context.Pipe()
                self.connection = parent
                self.process = context.Process(target=self.entrypoint, args=(child,))
                self.process.start()
                child.close()
            connection = self.connection
        assert connection is not None
        try:
            connection.send(task.model_dump())
            if not connection.poll(self.timeout):
                self.close()
                return {
                    "status": "incomplete",
                    "error_code": "task_deadline_exceeded",
                    "deadline_seconds": self.timeout,
                    "partial_results_preserved": True,
                }
            result = connection.recv()
            if not isinstance(result, dict):
                raise ValueError("Invalid task process result")
            return result
        except (EOFError, BrokenPipeError, OSError):
            self.close()
            if self.cancelled.is_set():
                raise TaskCancelled() from None
            return {"status": "incomplete", "error_code": "task_process_failed"}
        except BaseException:
            self.close()
            raise

    def abort(self) -> None:
        self.cancelled.set()
        self.close()

    def close(self) -> None:
        with self.lock:
            process, connection = self.process, self.connection
            self.process = self.connection = None
        if process is not None:
            if process.is_alive():
                if os.name == "posix":
                    # Browser drivers can create separate sessions; include their descendants.
                    tree = subprocess.check_output(["ps", "-eo", "pid=,ppid="], text=True, timeout=2)
                    pairs = [tuple(map(int, line.split())) for line in tree.splitlines() if len(line.split()) == 2]
                    descendants = {process.pid}
                    while True:
                        expanded = descendants | {pid for pid, parent in pairs if parent in descendants}
                        if expanded == descendants:
                            break
                        descendants = expanded
                    for pid in descendants - {process.pid}:
                        try:
                            os.kill(pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        process.kill()
                else:
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], check=True, timeout=5)
            process.join(timeout=5)
            if process.is_alive():
                raise RuntimeError("Task process cancellation did not complete")
            process.close()
        if connection is not None:
            connection.close()
