"""Common Crawl board discovery: URL parsing, candidate collapsing, Ireland probe."""

from __future__ import annotations

from tools import discover_boards as db


def test_path_board_extracts_first_segment() -> None:
    assert db.PROVIDERS["greenhouse"]["extract"]("https://job-boards.greenhouse.io/acme/jobs/1") == "acme"
    assert db.PROVIDERS["ashby"]["extract"]("https://jobs.ashbyhq.com/acme/uuid") == "acme"
    assert db.PROVIDERS["lever"]["extract"]("https://jobs.lever.co/acme/uuid/apply") == "acme"
    assert db.PROVIDERS["workable"]["extract"]("https://apply.workable.com/acme/j/ABC") == "acme"
    # index pages and non-board segments are not boards
    assert db.PROVIDERS["greenhouse"]["extract"]("https://job-boards.greenhouse.io/") is None
    assert db.PROVIDERS["lever"]["extract"]("https://jobs.lever.co/jobs") is None


def test_workday_board_skips_locale_and_noise() -> None:
    assert db._workday_board("https://acme.wd1.myworkdayjobs.com/en-US/External/job/Dublin/Engineer") == (
        "acme.wd1.myworkdayjobs.com/External"
    )
    assert db._workday_board("https://acme.wd1.myworkdayjobs.com/External") == "acme.wd1.myworkdayjobs.com/External"
    assert db._workday_board("https://acme.wd1.myworkdayjobs.com/robots.txt") is None
    assert db._workday_board("https://example.com/External") is None


def test_candidate_boards_dedupes_and_builds_urls() -> None:
    urls = [
        "https://job-boards.greenhouse.io/acme/jobs/1",
        "https://job-boards.greenhouse.io/acme/jobs/2",
        "https://job-boards.greenhouse.io/beta/jobs/3",
    ]
    assert db.candidate_boards("greenhouse", urls) == {
        "acme": "https://job-boards.greenhouse.io/acme",
        "beta": "https://job-boards.greenhouse.io/beta",
    }


def test_slug_name_is_readable() -> None:
    assert db._slug_name("acme-corp") == "Acme Corp"
    assert db._slug_name("a_b") == "A B"


def test_probe_irish_counts_only_explicit_ireland(monkeypatch) -> None:
    monkeypatch.setattr(
        db,
        "extract_jobs_from_listing",
        lambda name, url, html, provider: [
            {"location": "Dublin, Ireland"},
            {"location": "London, United Kingdom"},
            {"location": "Remote"},
        ],
    )
    assert db.probe_irish("greenhouse", "acme", "https://job-boards.greenhouse.io/acme", "Acme") == 1


def test_probe_irish_returns_zero_on_error(monkeypatch) -> None:
    def boom(*args, **kwargs):
        raise RuntimeError("network down")

    monkeypatch.setattr(db, "extract_jobs_from_listing", boom)
    assert db.probe_irish("greenhouse", "acme", "https://job-boards.greenhouse.io/acme", "Acme") == 0


def test_group_token_boards_ignores_host_and_junk_boards() -> None:
    records = [
        {"company": "Acme", "url": "https://job-boards.greenhouse.io/acme/jobs/1"},
        {"company": "Acme", "url": "https://job-boards.greenhouse.io/acme/jobs/2"},
        {"company": "Amazon", "url": "https://www.amazon.jobs/en/jobs/1"},  # host-based, not a token board
        {"company": "Workable", "url": "https://apply.workable.com/j/ABC"},  # junk board segment
    ]
    grouped = db._group_token_boards(records)
    assert set(grouped) == {("greenhouse", "acme")}
    assert grouped[("greenhouse", "acme")]["count"] == 2


def test_board_from_external_id_recovers_vanity_domains() -> None:
    assert db._board_from_external_id("greenhouse", "vectranetworks:8226353") == "vectranetworks"
    assert db._board_from_external_id("teamtailor", "zinkworks.teamtailor.com:8501604") == "zinkworks"
    assert (
        db._board_from_external_id("workday", "jll.wd1.myworkdayjobs.com/jllcareers:/job/Dublin/x")
        == "jll.wd1.myworkdayjobs.com/jllcareers"
    )
    assert db._board_from_external_id("paycom", "cc2ade32d57cafb5a1f7eea5c95bb830:22") is None
    assert db._board_from_external_id("greenhouse", "1234567890123456:1") is None


def test_group_token_boards_prefers_external_id_over_url() -> None:
    records = [
        {
            "source": "greenhouse",
            "external_id": "vectranetworks:8226353",
            "company": "Vectra",
            "url": "https://www.vectra.ai/about/jobs?gh_jid=8226353",
        },
        {
            "source": "workable",
            "external_id": "winthrop-technologies:ABC",
            "company": "Winthrop Technologies",
            "url": "https://apply.workable.com/j/ABC",
        },
    ]
    grouped = db._group_token_boards(records)
    assert set(grouped) == {("greenhouse", "vectranetworks"), ("workable", "winthrop-technologies")}


def test_discover_from_employers_uses_direct_ats(monkeypatch) -> None:
    import database.client as dclient
    from tools import discover_boards as db

    monkeypatch.setattr(
        db,
        "_select_all",
        lambda _client, table, _cols: (
            [{"id": 1, "name": "Acme", "careers_url": "https://job-boards.greenhouse.io/acme"}]
            if table == "employers"
            else []
        ),
    )
    monkeypatch.setattr(db, "_live_boards", lambda: set())
    monkeypatch.setattr(dclient, "get_supabase", lambda: object())
    inserted: list[dict] = []
    monkeypatch.setattr(db, "_insert_boards", lambda _client, payloads: inserted.extend(payloads) or len(payloads))

    result = db.discover_from_employers(apply=True)
    assert result["inserted"] == 1
    assert inserted[0]["provider"] == "greenhouse"
    assert inserted[0]["board"] == "acme"
    assert inserted[0]["discovery_source"] == "employers"


def test_discover_from_records_inserts_only_unknown() -> None:
    inserted: list[dict] = []

    class _Query:
        def insert(self, payloads):
            inserted.extend(payloads)
            return self

        def execute(self):
            return type("Result", (), {"data": []})()

    class _Client:
        def table(self, name):
            return _Query()

    records = [
        {"company": "Newco", "url": "https://jobs.lever.co/newco/uuid"},
        {"company": "Known", "url": "https://jobs.lever.co/known/uuid"},
    ]
    result = db.discover_from_records(
        records, source="freehire", known={("lever", "known")}, apply=True, client=_Client()
    )
    assert result == {"candidates": 1, "insertable": 1, "inserted": 1}
    assert inserted[0]["company"] == "Newco"
    assert inserted[0]["provider"] == "lever"
    assert inserted[0]["careers_url"] == "https://jobs.lever.co/newco"
    assert inserted[0]["discovery_source"] == "freehire"
