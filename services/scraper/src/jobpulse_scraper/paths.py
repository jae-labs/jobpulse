"""Packaged resources and explicit writable runtime locations."""

import os
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
_EDITABLE_HOME = PACKAGE_ROOT.parents[1]
_EDITABLE = (_EDITABLE_HOME / "pyproject.toml").is_file()
SERVICE_ROOT = Path(os.environ.get("JOBPULSE_SCRAPER_HOME", _EDITABLE_HOME if _EDITABLE else Path.cwd()))
REPO_ROOT = SERVICE_ROOT.parent.parent if _EDITABLE else SERVICE_ROOT
STATE_ROOT = Path(os.environ.get("JOBPULSE_CRAWL_STATE", REPO_ROOT / ".backups" / "crawler"))
