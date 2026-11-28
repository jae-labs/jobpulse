"""Relocate company runtime data without replacing databases or dropping SQLite sidecars."""

from __future__ import annotations

import fcntl
import json
from pathlib import Path

from jobpulse_scraper.paths import COMPANY_INDEX_ROOT, COMPANY_RESEARCH_ROOT, DATA_ROOT, REPO_ROOT


def relocate_directory(legacy: Path, destination: Path, guard_root: Path) -> None:
    if legacy.is_symlink() or guard_root.is_symlink():
        raise ValueError("Company data relocation requires real directories")
    if not legacy.exists():
        return
    guard_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (guard_root / ".company-data-move.lock").open("a") as guard:
        try:
            fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError("Company data relocation is busy; retry after the other command completes") from exc
        if not legacy.exists():
            return
        if legacy.is_symlink() or not legacy.is_dir() or destination.is_symlink():
            raise ValueError("Company data relocation requires real directories")
        if destination.exists():
            raise FileExistsError(
                "Both company data locations exist; inspect them and select an explicit --root/--cache"
            )
        with (legacy / "import.lock").open("a") as writer:
            try:
                fcntl.flock(writer, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise RuntimeError("Stop active company commands before relocating their data") from exc
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            # A same-filesystem directory rename retains databases, WAL/SHM files, caches and reports together.
            legacy.rename(destination)
            print(
                json.dumps({"company_research": "local_data_relocated", "from": str(legacy), "to": str(destination)}),
                flush=True,
            )


def prepare_company_root(root: Path) -> None:
    legacy_roots = {
        COMPANY_INDEX_ROOT: REPO_ROOT / ".backups/company-index",
        COMPANY_RESEARCH_ROOT: REPO_ROOT / ".backups/company-research",
    }
    legacy = legacy_roots.get(root)
    if legacy is not None:
        relocate_directory(legacy, root, DATA_ROOT)
