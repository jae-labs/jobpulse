"""Synthetic snapshot, identity, provenance and failure recovery contracts."""

import csv
import io
import json
import zipfile
from dataclasses import replace

import pytest

from jobpulse_scraper.company_index.importers import cro_rows, overture_rows
from jobpulse_scraper.company_index.store import CompanyIndex, Place, domain, name_key


def publish(index, source, rows):
    return index.replace(source, rows, version="synthetic", attribution="test source", sha256="a" * 64)


def test_cro_registered_address_is_not_an_office(tmp_path):
    path = tmp_path / "cro.zip"
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=["company_num", "company_name", "company_status", "company_address_1"])
    writer.writeheader()
    writer.writerow(
        dict(
            company_num="1",
            company_name="Synthetic Labs Limited",
            company_status="Normal",
            company_address_1="1 Example Street",
        )
    )
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("../../companies.csv", stream.getvalue())
    rows = list(cro_rows(path))
    assert rows[0].kind == "registered_address"
    assert rows[0].latitude is None
    assert not (tmp_path.parent / "companies.csv").exists()
    index = CompanyIndex(tmp_path / "index.sqlite")
    publish(index, "cro", rows)
    result = index.match("Synthetic Labs")
    assert result["status"] == "review"
    assert result["candidates"][0]["address"] == "1 Example Street"
    assert result["automatic_office_writes"] == 0
    assert result["candidates"][0]["review_required"]
    assert index.match("Other brand", company_number="1")["status"] == "identity_supported"
    index.close()


def test_atomic_refresh_recovers_from_midstream_crash_and_empty_snapshot(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    row = Place("cro", "1", "Synthetic", "registered_address", "")
    publish(index, "cro", [row])

    def interrupted():
        yield replace(row, identity="2", name="Changed")
        raise RuntimeError("synthetic interruption")

    with pytest.raises(RuntimeError):
        publish(index, "cro", interrupted())
    with pytest.raises(ValueError):
        publish(index, "cro", [])
    assert index.match("Synthetic")["status"] == "review"
    assert index.match("Changed")["status"] == "unmatched"
    assert index.metadata()[0]["records"] == 1
    index.close()


def test_domain_conflicts_subsidiaries_and_closed_places_remain_review(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    rows = [
        Place(
            "overture",
            "a",
            "Synthetic",
            "operating_place_candidate",
            "1 Example Street",
            websites=("https://foreign.example",),
        ),
        Place(
            "overture",
            "b",
            "Synthetic Ireland",
            "operating_place_candidate",
            "",
            websites=("https://synthetic.example",),
            status="permanently_closed",
        ),
    ]
    publish(index, "overture", rows)
    result = index.match("Synthetic", "https://synthetic.example")
    assert result["status"] == "review"
    assert result["candidates"][0]["domain_conflict"]
    assert result["candidates"][1]["closed"]
    assert name_key("Synthetic Ireland") != name_key("Synthetic")
    index.close()


def test_domain_supported_multiple_branches_keep_provenance_and_review(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    row = Place(
        "overture",
        "a",
        "Synthetic",
        "operating_place_candidate",
        "1 Example Street",
        websites=("https://www.synthetic.example",),
        evidence='[{"dataset":"synthetic"}]',
    )
    publish(index, "overture", [row, replace(row, identity="b", address="2 Example Street")])
    result = index.match("Synthetic", "https://synthetic.example")
    assert result["status"] == "identity_supported"
    assert len(result["candidates"]) == 2
    assert all(c["review_required"] and c["evidence"] for c in result["candidates"])
    assert domain("https://user:pass@synthetic.example") == ""
    index.close()


def test_overture_excludes_explicit_foreign_and_retains_unknown_country(tmp_path):
    path = tmp_path / "places.jsonl"
    row = dict(
        id="a",
        name="Synthetic",
        latitude=53.3,
        longitude=-6.2,
        addresses=[dict(country="IE", freeform="1 Example Street", locality="Dublin")],
        websites=[],
        sources=[dict(dataset="synthetic")],
    )
    path.write_text(
        "\n".join(
            json.dumps(r)
            for r in [row, {**row, "id": "b", "addresses": [dict(country="GB")]}, {**row, "id": "c", "addresses": []}]
        )
    )
    records = list(overture_rows(path))
    assert [r.identity for r in records] == ["a", "c"]
    assert records[1].country == ""
    path.write_text(json.dumps({**row, "latitude": float("nan")}))
    with pytest.raises(ValueError):
        list(overture_rows(path))


def test_readers_see_committed_snapshot_during_writer_failure(tmp_path):
    path = tmp_path / "index.sqlite"
    writer = CompanyIndex(path)
    publish(writer, "cro", [Place("cro", "1", "Synthetic", "registered_address", "")])
    reader = CompanyIndex(path)

    def rows():
        yield Place("cro", "2", "Changed", "registered_address", "")
        assert reader.match("Synthetic")["status"] == "review"
        assert reader.match("Changed")["status"] == "unmatched"
        raise RuntimeError("crash")

    with pytest.raises(RuntimeError):
        publish(writer, "cro", rows())
    reader.close()
    writer.close()


def test_conflicting_company_numbers_cannot_establish_unique_legal_identity(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    row = Place("cro", "1:a", "Synthetic", "registered_address", "", company_number="1")
    publish(index, "cro", [row, replace(row, identity="1:b", status="Dissolved")])
    result = index.match("Synthetic", company_number="1")
    assert result["status"] == "review"
    assert len(result["candidates"]) == 2
    assert domain("https://linkedin.com/company/synthetic") == ""
    index.close()


def test_duplicate_ids_abort_snapshot_instead_of_overwriting_evidence(tmp_path):
    import sqlite3

    index = CompanyIndex(tmp_path / "index.sqlite")
    row = Place("cro", "1", "Synthetic", "registered_address", "")
    publish(index, "cro", [row])
    with pytest.raises(sqlite3.IntegrityError):
        publish(index, "cro", [row, replace(row, address="Other")])
    assert index.match("Synthetic")["candidates"][0]["address"] == ""
    index.close()


def test_candidate_query_plan_uses_indexes(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    for query in [
        "SELECT payload FROM places WHERE name_key='synthetic'",
        "SELECT payload FROM places WHERE json_extract(payload, '$.company_number')='1'",
        "SELECT identity FROM domains WHERE domain='synthetic.example'",
    ]:
        plan = index.connection.execute("EXPLAIN QUERY PLAN " + query).fetchall()
        assert any("USING INDEX" in row[3] for row in plan)
    index.close()


def test_download_failure_keeps_previous_raw_snapshot(tmp_path, monkeypatch):
    import httpx

    from jobpulse_scraper.company_index.download import download_cro

    target = tmp_path / "companies.csv.zip"
    target.write_bytes(b"previous snapshot")
    client_class = httpx.Client
    monkeypatch.setattr(
        httpx,
        "Client",
        lambda **kwargs: client_class(
            transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"not a ZIP"))
        ),
    )
    with pytest.raises(zipfile.BadZipFile):
        download_cro(tmp_path)
    assert target.read_bytes() == b"previous snapshot"
    assert not list(tmp_path.glob("*.partial"))


def test_cro_download_ceiling_discards_partial_file(tmp_path, monkeypatch):
    import httpx

    from jobpulse_scraper.company_index import download

    client_class = httpx.Client
    monkeypatch.setattr(download, "MAX_DOWNLOAD", 3)
    monkeypatch.setattr(
        httpx,
        "Client",
        lambda **kwargs: client_class(
            transport=httpx.MockTransport(lambda request: httpx.Response(200, content=b"oversized"))
        ),
    )
    with pytest.raises(ValueError, match="exceeds"):
        download.download_cro(tmp_path)
    assert not list(tmp_path.glob("*.partial"))
    assert not (tmp_path / "companies.csv.zip").exists()


def test_import_lock_is_released_after_process_exit(tmp_path):
    import subprocess
    import sys

    from jobpulse_scraper.company_index.download import index_lock

    code = """import sys
from pathlib import Path
from jobpulse_scraper.company_index.download import index_lock
with index_lock(Path(sys.argv[1])):
 print('locked', flush=True)
 sys.stdin.readline()
"""
    process = subprocess.Popen(
        [sys.executable, "-c", code, str(tmp_path)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
    )
    try:
        assert process.stdout is not None
        assert process.stdout.readline().strip() == "locked"
        process.terminate()
        process.wait(timeout=5)
        with index_lock(tmp_path):
            assert (tmp_path / "import.lock").is_file()
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)


def test_unicode_business_names_remain_searchable(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    row = Place("overture", "1", "Συνθετική", "operating_place_candidate", "")
    publish(index, "overture", [row])
    assert index.match("Συνθετική")["status"] == "review"
    index.close()


def test_fuzzy_typo_and_reordered_tokens_are_review_only(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    row = Place("cro", "1", "Synthetic Harbour Technologies", "registered_address", "")
    publish(index, "cro", [row])
    assert index.match("Synthetic Harbor Technologies")["status"] == "unmatched"
    result = index.match("Synthetic Harbor Technologies", fuzzy=True)
    assert result["status"] == "review"
    assert result["candidates"][0]["match_reasons"] == ["similar_name"]
    assert result["candidates"][0]["name_similarity"] > 90
    assert result["candidates"][0]["extra_name_tokens"] == ["harbour"]
    assert result["automatic_office_writes"] == 0
    reordered = index.match("Harbour Synthetic Technologies", fuzzy=True)
    assert reordered["candidates"][0]["name_similarity"] == 100
    index.close()


def test_fuzzy_never_promotes_country_or_business_unit_similarity(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    row = Place(
        "overture",
        "1",
        "Synthetic Ireland Services",
        "operating_place_candidate",
        "",
        websites=("https://foreign.example",),
        status="permanently_closed",
    )
    publish(index, "overture", [row])
    result = index.match("Synthetic Iceland Services", "https://synthetic.example", fuzzy=True)
    assert result["status"] == "review"
    candidate = result["candidates"][0]
    assert candidate["missing_name_tokens"] == ["iceland"]
    assert candidate["extra_name_tokens"] == ["ireland"]
    assert candidate["closed"] and candidate["domain_conflict"] and candidate["review_required"]
    assert index.match("SYN", fuzzy=True)["status"] == "unmatched"
    assert index.match("Unrelated Example Labs", fuzzy=True)["status"] == "unmatched"
    index.close()


def test_fuzzy_index_tracks_commits_and_rollbacks(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    row = Place("cro", "1", "Synthetic Harbour Technologies", "registered_address", "")
    publish(index, "cro", [row])
    index.prepare_fuzzy()

    def crash():
        yield replace(row, name="Different Harbour Technologies")
        raise RuntimeError("interrupted")

    with pytest.raises(RuntimeError):
        publish(index, "cro", crash())
    assert index.match("Synthetic Harbor Technologies", fuzzy=True)["candidates"][0]["name"] == row.name
    publish(index, "cro", [replace(row, name="Different Harbour Technologies")])
    assert index.match("Synthetic Harbor Technologies", fuzzy=True)["status"] == "unmatched"
    assert index.match("Different Harbor Technologies", fuzzy=True)["status"] == "review"
    index.close()
    reopened = CompanyIndex(tmp_path / "index.sqlite")
    assert reopened.match("Different Harbor Technologies", fuzzy=True)["status"] == "review"
    reopened.close()


def test_fuzzy_bounds_and_literal_syntax(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    rows = [Place("cro", str(i), "Synthetic Harbour", "registered_address", "") for i in range(1002)]
    publish(index, "cro", rows)
    result = index.match("Synthetic Harbor", fuzzy=True)
    assert len(result["candidates"]) == 10
    assert result["fuzzy_search_truncated"]
    assert index.close_matches("a" * 129) == ([], False)
    with pytest.raises(ValueError):
        index.close_matches("Synthetic", threshold=101)
    index.match('Synthetic "Harbor" OR NOT *', fuzzy=True)
    index.close()


def test_fuzzy_does_not_displace_exact_evidence(tmp_path):
    index = CompanyIndex(tmp_path / "index.sqlite")
    publish(
        index,
        "cro",
        [
            Place("cro", "1", "Synthetic Harbor", "registered_address", ""),
            Place("cro", "2", "Synthetic Harbour", "registered_address", ""),
        ],
    )
    result = index.match("Synthetic Harbor", fuzzy=True)
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["match_reasons"] == ["normalized_name"]
    index.close()


def test_fuzzy_spelling_only_lookalikes_are_explicit():
    from jobpulse_scraper.company_index.similarity import name_similarity

    result = name_similarity("aramark ireland", "caremark ireland")
    assert result["name_similarity"] > 85
    assert result["spelling_only"]
    assert result["shared_non_generic_name_tokens"] == []
    assert not name_similarity("johnson johnson", "johnson and johnson")["spelling_only"]
