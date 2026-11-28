"""harvest-ats: detect the ATS behind a company website and add the board."""

from __future__ import annotations

from tools import harvest_ats as ha


def test_candidate_urls_prefers_careers_then_paths() -> None:
    urls = ha._candidate_urls("https://acme.ie", "https://acme.ie/about/careers")
    assert urls[0] == "https://acme.ie/about/careers"
    assert "https://acme.ie/careers" in urls


def test_candidate_urls_skips_job_detail_links() -> None:
    urls = ha._candidate_urls("https://acme.ie", "https://jobsireland.ie/en-US/job-Details?id=1")
    assert all("jobsireland" not in url for url in urls)


def test_detect_from_page_finds_embedded_ats_url() -> None:
    page = '<iframe src="https://boards.greenhouse.io/acme"></iframe>'
    assert ha._detect_from_page("https://acme.ie/careers", page) == ("greenhouse", "acme")


def test_detect_from_page_finds_host_marker() -> None:
    page = '<script src="https://cdn.phenompeople.com/x.js"></script>'
    assert ha._detect_from_page("https://careers.acme.com", page) == ("phenom", "careers.acme.com")


def test_detect_from_page_returns_none_for_plain_page() -> None:
    assert ha._detect_from_page("https://acme.ie/careers", "<html>hello</html>") is None


def test_detect_from_page_ignores_social_and_broad_links() -> None:
    page = '<a href="https://www.linkedin.com/company/acme">LinkedIn</a>'
    assert ha._detect_from_page("https://acme.ie/careers", page) is None


def test_harvest_ats_detects_and_inserts(monkeypatch) -> None:
    monkeypatch.setattr(
        ha,
        "_select_all",
        lambda _client, table, _cols: (
            [{"id": 1, "name": "Acme", "website": "https://acme.ie", "careers_url": ""}] if table == "employers" else []
        ),
    )
    monkeypatch.setattr(
        ha, "detect_board", lambda url, allow_browser=True: ("greenhouse", "acme") if url.endswith("/careers") else None
    )
    inserted: list[dict] = []

    class _Query:
        def insert(self, payloads):
            inserted.extend(payloads)
            return self

        def execute(self):
            return type("Result", (), {"data": []})()

    class _Client:
        def table(self, _name):
            return _Query()

    monkeypatch.setattr(ha, "get_supabase", lambda: _Client())

    result = ha.harvest_ats(limit=10, apply=True)
    assert result["inserted"] == 1
    assert inserted[0]["provider"] == "greenhouse"
    assert inserted[0]["board"] == "acme"
    assert inserted[0]["careers_url"] == "https://job-boards.greenhouse.io/acme"
    assert inserted[0]["discovery_source"] == "harvest-ats"
