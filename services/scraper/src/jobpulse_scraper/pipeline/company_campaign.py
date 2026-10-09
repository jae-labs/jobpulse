"""Bounded subprocess stages with live output and interruption cleanup."""

from __future__ import annotations

import os
import signal
import subprocess
from pathlib import Path

from jobpulse_scraper.pipeline.research_progress import event, progress


def run_stage(command: list[str], *, stage: str, timeout: float, cwd: Path) -> bool:
    process = subprocess.Popen(command, cwd=cwd, start_new_session=True)
    try:
        with progress(stage, pid=process.pid):
            try:
                code = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                event("deadline_exceeded", stage=stage, timeout_seconds=timeout)
                return False
        event("stage_outcome", stage=stage, exit_code=code)
        return code == 0
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
