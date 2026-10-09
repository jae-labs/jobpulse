"""Research shares public cohorts, checkpoints failures and bounds child work."""

import json
import sys
import time
from pathlib import Path

import pytest

from jobpulse_scraper.pipeline.company_campaign import run_stage
from jobpulse_scraper.pipeline.research_progress import progress
from tools import research_companies


def setup_campaign(tmp_path, monkeypatch, *, fail=False):
    monkeypatch.setattr(research_companies, "CACHE_ROOT", tmp_path / "cache")
    root = tmp_path / "index"
    root.mkdir()
    (root / "companies.sqlite3").touch()
    employers = tmp_path / "employers.json"
    employers.write_text(
        json.dumps(
            [{"id": i, "name": f"Synthetic Company {i}", "website": "", "private_score": 99} for i in range(1, 4)]
        )
    )
    calls = []

    def fake_stage(command, **kwargs):
        script = Path(command[1]).name
        args = command[2:]
        cohort = json.loads(Path(args[args.index("--employers") + 1]).read_text())
        calls.append((script, cohort))
        assert all("private_score" not in e for e in cohort)
        if script == "company_index.py":
            Path(args[args.index("--report") + 1]).write_text(json.dumps({"results": cohort}))
        elif script == "review_company_matches.py":
            Path(args[args.index("--report") + 1]).write_text(json.dumps({"results": cohort}))
        else:
            if fail:
                return False
            Path(args[args.index("--report") + 1]).write_text(json.dumps({"results": cohort}))
        return True

    monkeypatch.setattr(research_companies, "run_stage", fake_stage)
    monkeypatch.setattr(
        sys, "argv", ["research", "--root", str(root), "--employers", str(employers), "--batch-size", "2"]
    )
    return root, calls


def test_shared_cohort_and_separate_evidence(tmp_path, monkeypatch):
    root, calls = setup_campaign(tmp_path, monkeypatch)
    research_companies.main()
    assert len(calls) == 6
    assert calls[0][1] == calls[1][1] == calls[2][1]
    assert calls[3][1] == calls[4][1] == calls[5][1]
    report = json.loads(next(root.glob("campaigns/*/report.json")).read_text())
    assert report["completed"] and report["checked"] == 3
    assert report["automatic_writes"] == 0
    assert set(report["batches"][0]) >= {"snapshot", "identity", "ai"}
    assert "Irish headcount remains unknown" in report["staff_size_scope"]


def test_failure_checkpoints_and_stops_next_batch(tmp_path, monkeypatch):
    root, calls = setup_campaign(tmp_path, monkeypatch, fail=True)
    with pytest.raises(SystemExit) as exc:
        research_companies.main()
    assert exc.value.code == 1
    assert len(calls) == 3
    report = json.loads(next(root.glob("campaigns/*/report.json")).read_text())
    assert not report["completed"] and report["checked"] == 2
    assert report["failed_stages"] == 1
    assert "ai" not in report["batches"][0]


def test_stage_deadline_terminates_child(tmp_path):
    marker = tmp_path / "finished"
    code = f"import time; from pathlib import Path; time.sleep(.3); Path({str(marker)!r}).touch()"
    assert not run_stage([sys.executable, "-c", code], stage="synthetic", timeout=0.03, cwd=tmp_path)
    time.sleep(0.4)
    assert not marker.exists()


def test_live_heartbeat_stops_on_error(capsys):
    with pytest.raises(ValueError), progress("synthetic", interval=0.01):
        time.sleep(0.04)
        raise ValueError("synthetic")
    output = capsys.readouterr().out
    assert '"waiting"' in output and '"finished"' in output
    time.sleep(0.03)
    assert capsys.readouterr().out == ""


def test_ai_cohort_rejects_foreign_identity_without_report(tmp_path, monkeypatch):
    from tools import enrich_companies_ai

    monkeypatch.setattr(enrich_companies_ai, "CACHE_ROOT", tmp_path / "cache")
    cohort = tmp_path / "public.json"
    cohort.write_text(json.dumps([{"id": 8, "name": "Synthetic Eight", "private": "discard"}]))
    report = tmp_path / "ai.json"
    monkeypatch.setattr(sys, "argv", ["ai", "--employers", str(cohort), "--report", str(report)])
    monkeypatch.setattr(enrich_companies_ai, "get_supabase", lambda: pytest.fail("File cohort must not query Supabase"))
    monkeypatch.setattr(enrich_companies_ai, "enrich_companies_with_ai", lambda names, **kwargs: [{"name": "Foreign"}])
    with pytest.raises(SystemExit) as exc:
        enrich_companies_ai.main()
    assert exc.value.code == 1
    assert not report.exists()


def test_ai_cohort_preserves_requested_employer_id(tmp_path, monkeypatch):
    from tools import enrich_companies_ai

    monkeypatch.setattr(enrich_companies_ai, "CACHE_ROOT", tmp_path / "cache")
    cohort = tmp_path / "public.json"
    cohort.write_text(json.dumps([{"id": 8, "name": "Synthetic Eight"}]))
    report = tmp_path / "ai.json"
    monkeypatch.setattr(sys, "argv", ["ai", "--employers", str(cohort), "--report", str(report)])
    monkeypatch.setattr(enrich_companies_ai, "get_supabase", lambda: pytest.fail("No database access"))
    monkeypatch.setattr(
        enrich_companies_ai,
        "enrich_companies_with_ai",
        lambda names, **kwargs: [{"name": names[0], "sector": "", "size": "", "offices": []}],
    )
    enrich_companies_ai.main()
    proposal = json.loads(report.read_text())
    assert proposal["status"] == "unverified_proposals"
    assert proposal["results"][0]["employer_id"] == 8
    assert proposal["results"][0]["proposal"]["size"] == ""
