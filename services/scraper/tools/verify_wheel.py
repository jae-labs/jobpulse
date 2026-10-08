"""Validate the built wheel and its CLI without importing the editable checkout."""

import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def main() -> None:
    directory = Path(sys.argv[1])
    wheels = sorted(directory.glob("jobpulse_scraper-*.whl"))
    if len(wheels) != 1:
        raise RuntimeError("Expected one scraper wheel")
    wheel = wheels[0].resolve()
    with zipfile.ZipFile(wheel) as archive:
        names = set(archive.namelist())
        required = {
            "jobpulse_scraper/py.typed",
            "jobpulse_scraper/app.py",
            "jobpulse_scraper/config/websites.yaml",
            "jobpulse_scraper/config/request_policy.yaml",
        }
        if not required <= names:
            raise RuntimeError("Built wheel omits required runtime resources")
    with tempfile.TemporaryDirectory(prefix="jobpulse-wheel-") as temporary:
        target = Path(temporary) / "installed"
        subprocess.run(
            ["uv", "pip", "install", "--no-deps", "--target", str(target), str(wheel)],
            check=True,
            capture_output=True,
        )
        code = (
            "import sys;sys.path.insert(0,sys.argv[1]);import jobpulse_scraper;"
            "assert jobpulse_scraper.__file__.startswith(sys.argv[1]);"
            "from jobpulse_scraper.app import main;sys.argv=['jobpulse-scraper','--validate-config'];main()"
        )
        environment = {
            key: value
            for key, value in os.environ.items()
            if key
            not in {
                "PYTHONPATH",
                "JOBPULSE_SCRAPER_HOME",
                "JOBPULSE_CRAWL_STATE",
                "SUPABASE_URL",
                "SUPABASE_SERVICE_ROLE_KEY",
            }
        }
        result = subprocess.run(
            [sys.executable, "-I", "-c", code, str(target)],
            cwd=temporary,
            env=environment,
            capture_output=True,
            text=True,
        )
        if result.returncode:
            raise RuntimeError(result.stderr)
    print("PASS installed wheel CLI and packaged configuration outside checkout")


if __name__ == "__main__":
    main()
