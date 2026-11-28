"""Isolated tasks retain warm state and terminate deadlines without orphan browsers."""

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from jobpulse_scraper.runtime.process_execution import TaskCancelled, TaskProcess
from jobpulse_scraper.runtime.queue import CrawlTask


def echo_server(connection):
    if os.name == "posix":
        os.setsid()
    count = 0
    while connection.recv() is not None:
        count += 1
        connection.send({"status": "complete", "count": count})


def stalled_server(connection):
    if os.name == "posix":
        os.setsid()
    task = connection.recv()
    descendant = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True)
    Path(task["target"]["marker"]).write_text(str(descendant.pid))
    time.sleep(60)


def crashed_server(connection):
    connection.recv()
    os._exit(9)


def task(target=None):
    return CrawlTask(
        id="synthetic-task",
        source_key="synthetic-source",
        lease_token="synthetic-lease",
        attempt=1,
        target=target or {},
    )


def test_process_reuses_warm_state_and_clears_resources():
    process = TaskProcess(5, entrypoint=echo_server)
    try:
        assert process.execute(task())["count"] == 1
        assert process.execute(task())["count"] == 2
    finally:
        process.close()
    assert process.process is None and process.connection is None


def test_deadline_terminates_detached_descendants_and_next_task_recovers(tmp_path):
    marker = tmp_path / "synthetic-child.pid"
    process = TaskProcess(1.5, entrypoint=stalled_server)
    began = time.monotonic()
    try:
        result = process.execute(task({"marker": str(marker)}))
        assert result["error_code"] == "task_deadline_exceeded"
        assert result["partial_results_preserved"] is True
        assert time.monotonic() - began < 8
        pid = int(marker.read_text())
        state = subprocess.run(["ps", "-p", str(pid), "-o", "stat="], capture_output=True, text=True).stdout.strip()
        assert not state or state.startswith("Z")
        process.entrypoint = echo_server
        process.timeout = 5
        assert process.execute(task())["status"] == "complete"
    finally:
        process.close()


def test_crashed_process_reports_failure_and_can_restart():
    process = TaskProcess(5, entrypoint=crashed_server)
    try:
        assert process.execute(task())["error_code"] == "task_process_failed"
        process.entrypoint = echo_server
        assert process.execute(task())["status"] == "complete"
    finally:
        process.close()


def test_interrupt_cancels_active_process_and_prevents_later_start(tmp_path):
    marker = tmp_path / "cancelled-child.pid"
    process = TaskProcess(30, entrypoint=stalled_server)
    cancelled = threading.Event()

    def execute():
        try:
            process.execute(task({"marker": str(marker)}))
        except TaskCancelled:
            cancelled.set()

    thread = threading.Thread(target=execute)
    thread.start()
    try:
        until = time.monotonic() + 5
        while not marker.exists() and time.monotonic() < until:
            time.sleep(0.01)
        assert marker.exists()
        process.abort()
        thread.join(timeout=5)
        assert cancelled.is_set() and not thread.is_alive()
        try:
            process.execute(task())
        except TaskCancelled:
            pass
        else:
            raise AssertionError("Cancelled executor started another task")
    finally:
        process.abort()
        thread.join(timeout=5)
