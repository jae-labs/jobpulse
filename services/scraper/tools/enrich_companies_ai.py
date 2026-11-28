"""Compatibility entry point for one AI metadata batch of the company workflow."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.research_companies import main as research_main


def main() -> None:
    research_main(["--metadata-batch", *sys.argv[1:]])


if __name__ == "__main__":
    main()
