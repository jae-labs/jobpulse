"""Synthetic evidence and model boundaries for company identity proposals."""

import hashlib
import json
import socket
from types import SimpleNamespace

import pytest

from jobpulse_scraper.company_index import evidence, review
from jobpulse_scraper.company_index.store import CompanyIndex, Place
from tools.review_company_matches import alias_records, gather, public_employers


def pair():
    employer = {"id": 7, "name": "Synthetic Labs", "website": "https://synthetic.example", "company_number": "42"}
    candidate = {
        "source": "cro",
        "identity": "42:a",
        "name": "Synthetic Laboratories Limited",
        "kind": "registered_address",
        "company_number": "42",
        "websites": [],
        "status": "Normal",
    }
    return review.comparison_pair(employer, candidate, [])


def decision(p, **changes):
    return {
        "pair_id": p["pair_id"],
        "decision": "same_company",
        "relationship": "same_entity",
        "reason": "Equal legal company number in supplied facts",
        "citations": [
            {"fact_id": "employer.company_number", "quote": "42"},
            {"fact_id": "candidate.company_number", "quote": "42"},
        ],
        **changes,
    }


def test_equal_company_number_is_only_review_proposal():
    p = pair()
    result = review.validate_decisions({"decisions": [decision(p)]}, [p])[0]
    assert result["decision"] == "same_company"
    assert result["review_required"] and result["automatic_writes"] == 0


@pytest.mark.parametrize(
    "changes",
    [
        {"citations": [{"fact_id": "made_up", "quote": "42"}]},
        {"citations": [{"fact_id": "candidate.name", "quote": "Different name"}]},
        {"pair_id": "8:cro:42:a"},
        {"decision": "apply"},
    ],
)
def test_invented_identity_evidence_and_actions_are_rejected(changes):
    p = pair()
    with pytest.raises(ValueError):
        review.validate_decisions({"decisions": [decision(p, **changes)]}, [p])


def test_duplicate_or_missing_decisions_rejected():
    p = pair()
    for output in [[], [decision(p), decision(p)]]:
        with pytest.raises(ValueError):
            review.validate_decisions({"decisions": output}, [p])


@pytest.mark.parametrize("changes", [{"citations": []}, {"relationship": "subsidiary"}, {"relationship": "department"}])
def test_unsupported_positive_and_related_entity_claims_downgrade(changes):
    p = pair()
    result = review.validate_decisions({"decisions": [decision(p, **changes)]}, [p])[0]
    assert result["decision"] == "insufficient_evidence"
    assert result["model_decision"] == "same_company"


def test_first_party_quote_must_link_both_names_and_candidate_identity():
    p = pair()
    for f in p["facts"]:
        if f["id"] == "employer.company_number":
            f["value"] = ""
    text = "Synthetic Labs is a trading name of Synthetic Laboratories Limited."
    p["facts"].append(review.fact("first_party.0.text", text))
    d = decision(
        p,
        citations=[
            {"fact_id": "first_party.0.text", "quote": text},
            {"fact_id": "candidate.name", "quote": "Synthetic Laboratories Limited"},
        ],
    )
    assert review.validate_decisions({"decisions": [d]}, [p])[0]["decision"] == "same_company"
    d["citations"][0]["quote"] = "Synthetic Labs"
    assert review.validate_decisions({"decisions": [d]}, [p])[0]["decision"] == "insufficient_evidence"


def test_no_remembered_facts_or_unsupported_negative():
    p = pair()
    d = decision(p, decision="different_company", relationship="unrelated", citations=[])
    assert review.validate_decisions({"decisions": [d]}, [p])[0]["decision"] == "insufficient_evidence"


def test_provider_cache_binds_model_and_complete_evidence(tmp_path, monkeypatch):
    calls = []
    p = pair()
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-secret")
    monkeypatch.setattr(review, "find_agy_binary", lambda: "synthetic-agy")

    def run(cmd, **kwargs):
        calls.append((cmd, kwargs))
        assert "SUPABASE_SERVICE_ROLE_KEY" not in kwargs["env"]
        assert "--sandbox" in cmd and "plan" in cmd
        kwargs["stdout"].write(json.dumps({"structured_output": {"decisions": [decision(p)]}}))
        kwargs["stdout"].flush()
        return SimpleNamespace(pid=987654321, returncode=0, poll=lambda: 0, wait=lambda: 0)

    monkeypatch.setattr(review.subprocess, "Popen", run)
    reviewer = review.AgyReviewer(tmp_path)
    reviewer.compare([p])
    reviewer.compare([p])
    assert len(calls) == 1 and reviewer.cache_hits == 1
    p["facts"].append(review.fact("additional_fact", "changed"))
    reviewer.compare([p])
    assert len(calls) == 2
    review.AgyReviewer(tmp_path, model="another-model").compare([p])
    assert len(calls) == 3


def test_provider_timeout_never_saves_success_or_raw_error(tmp_path, monkeypatch):
    monkeypatch.setattr(review, "find_agy_binary", lambda: "synthetic-agy")

    def run(*args, **kwargs):
        return SimpleNamespace(pid=987654321, returncode=None, poll=lambda: None, wait=lambda: 0)

    monkeypatch.setattr(review.subprocess, "Popen", run)
    with pytest.raises(RuntimeError, match="timed out"):
        review.AgyReviewer(tmp_path, timeout=0).compare([pair()])
    assert not list(tmp_path.glob("*.json"))


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "https://foreign.example/",
        "https://user:pass@synthetic.example/",
        "https://synthetic.example/?token=secret",
        "https://synthetic.example:9999/",
    ],
)
def test_first_party_url_rejects_credentials_queries_and_foreign_hosts(url):
    with pytest.raises(ValueError):
        evidence.public_url(url, "synthetic.example")


def test_dns_private_address_denied(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args: [(None, None, None, None, ("10.0.0.1", 443))])
    with pytest.raises(ValueError, match="non-public"):
        evidence.public_url("https://synthetic.example/", "synthetic.example")


def test_first_party_cache_checksum_and_foreign_redirect(tmp_path, monkeypatch):
    monkeypatch.setattr(
        evidence,
        "public_url",
        lambda url, host: (
            "93.184.216.34" if "synthetic.example" in url else (_ for _ in ()).throw(ValueError("foreign"))
        ),
    )
    fetcher = evidence.EvidenceFetcher(tmp_path)
    monkeypatch.setattr(fetcher, "_request", lambda url: {"html": "<script>hidden</script><p>Synthetic Labs</p>"})
    witness = fetcher.fetch("https://synthetic.example/", "synthetic.example")
    assert witness["text"] == "Synthetic Labs"
    assert witness["sha256"] == hashlib.sha256(witness["text"].encode()).hexdigest()
    monkeypatch.setattr(fetcher, "_request", lambda url: {"redirect": "https://foreign.example/"})
    with pytest.raises(ValueError):
        fetcher.fetch("https://synthetic.example/legal", "synthetic.example")
    path = next(tmp_path.glob("*.json"))
    data = json.loads(path.read_text())
    data["text"] = "changed"
    path.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="checksum"):
        fetcher.fetch("https://synthetic.example/", "synthetic.example")


def test_alias_requires_published_first_party_text_and_never_uses_fuzzy(tmp_path, monkeypatch):
    index = CompanyIndex(tmp_path / "index.sqlite")
    index.replace(
        "cro",
        [Place("cro", "42:a", "Synthetic Laboratories Limited", "registered_address", "")],
        version="test",
        attribution="synthetic",
        sha256="a" * 64,
    )
    monkeypatch.setattr(index, "close_matches", lambda *args: pytest.fail("Fuzzy mode must remain unused"))

    class FakeFetcher:
        def fetch(self, url: str, expected_domain: str) -> dict:
            return {"url": url, "text": "Synthetic Labs is Synthetic Laboratories Limited"}

    fetcher = FakeFetcher()
    employer = {"id": 7, "name": "Synthetic Labs", "website": "https://synthetic.example", "company_number": ""}
    aliases = [
        {
            "employer_id": 7,
            "url": employer["website"],
            "aliases": ["Synthetic Laboratories Limited", "Invented Company"],
        }
    ]
    result = gather(index, employer, fetcher, aliases)
    assert len(result["candidates"]) == 1
    assert result["rejected_aliases"] == ["Invented Company"]
    index.close()


def test_public_input_discards_private_extras_and_duplicate_ids_fail(tmp_path):
    path = tmp_path / "employers.json"
    row = {"id": 7, "name": "Synthetic", "website": "", "private_profile": "do not send"}
    path.write_text(json.dumps([row]))
    assert "private_profile" not in public_employers(path, 20)[0]
    path.write_text(json.dumps([row, row]))
    with pytest.raises(ValueError):
        public_employers(path, 20)
    path.write_text(json.dumps([{"employer_id": 7, "url": "https://synthetic.example/", "aliases": ["Short"]}]))
    assert alias_records(path)[7][0]["aliases"] == ["Short"]


def test_request_pins_public_ip_and_bounds_body(tmp_path, monkeypatch):
    fetcher = evidence.EvidenceFetcher(tmp_path)
    monkeypatch.setattr(evidence, "public_url", lambda *args: "93.184.216.34")
    addresses = []
    monkeypatch.setattr(evidence.socket, "create_connection", lambda address, **kwargs: addresses.append(address))
    monkeypatch.setattr(evidence.gate, "reserve_delay", lambda url: 0)
    monkeypatch.setattr(evidence.gate, "check", lambda url: None)
    monkeypatch.setattr(evidence.gate, "observe", lambda *args: None)
    response = SimpleNamespace(
        status=200,
        getheader=lambda key: "text/html" if key == "Content-Type" else None,
        read1=lambda size: b"a" * 65536,
    )
    connection = SimpleNamespace(
        port=80, request=lambda *args, **kwargs: None, getresponse=lambda: response, close=lambda: None
    )
    monkeypatch.setattr(evidence.http.client, "HTTPConnection", lambda *args, **kwargs: connection)
    with pytest.raises(ValueError, match="1 MiB"):
        fetcher._request("http://synthetic.example/")
    assert addresses == [("93.184.216.34", 80)]


def test_retention_does_not_skip_expired_cache_entries(tmp_path):
    import os

    for i in range(3):
        path = tmp_path / f"{i}.json"
        path.write_text("{}")
        os.utime(path, (0, 0))
    evidence.EvidenceFetcher(tmp_path)
    assert not list(tmp_path.glob("*.json"))


def test_provider_batches_large_witness_payloads(tmp_path, monkeypatch):
    reviewer = review.AgyReviewer(tmp_path)
    batches = []
    monkeypatch.setattr(reviewer, "_compare_batch", lambda batch: batches.append(batch) or [])
    p = pair()
    p["facts"].append(review.fact("first_party.0.text", "x" * 90000))
    reviewer.compare([p, {**p, "pair_id": "different"}])
    assert [len(b) for b in batches] == [1, 1]


def test_identity_links_are_first_party_and_query_free():
    html = '<a href="/legal">Legal</a><a href="https://foreign.example/privacy">Bad</a><a href="/privacy?key=secret">Bad</a>'
    assert evidence.identity_links(html, "https://synthetic.example/", "synthetic.example") == [
        "https://synthetic.example/legal"
    ]


def test_inline_provider_schema_contains_no_refs():
    assert "$ref" not in json.dumps(review.inline_schema())


def test_interrupted_review_keeps_durable_journal_and_incomplete_checkpoint(tmp_path, monkeypatch):
    import sys

    from tools import review_company_matches as command

    index = CompanyIndex(tmp_path / "companies.sqlite3")
    index.replace(
        "cro",
        [
            Place("cro", "1", "Synthetic One", "registered_address", ""),
            Place("cro", "2", "Synthetic Two", "registered_address", ""),
        ],
        version="synthetic",
        attribution="synthetic",
        sha256="a" * 64,
    )
    index.close()
    employers = tmp_path / "employers.json"
    employers.write_text(json.dumps([{"id": 1, "name": "Synthetic One"}, {"id": 2, "name": "Synthetic Two"}]))

    class InterruptedReviewer:
        def __init__(self, *args, **kwargs):
            self.calls = 0
            self.cache_hits = 0

        def compare(self, pairs):
            self.calls += 1
            if self.calls == 2:
                raise KeyboardInterrupt()
            return [{"decision": "insufficient_evidence"}]

    monkeypatch.setattr(command, "AgyReviewer", InterruptedReviewer)
    monkeypatch.setattr(sys, "argv", ["review", "--root", str(tmp_path), "--employers", str(employers), "--no-fetch"])
    with pytest.raises(KeyboardInterrupt):
        command.main()
    rows = [json.loads(line) for line in (tmp_path / "identity-review.jsonl").read_text().splitlines()]
    assert len(rows) == 1 and rows[0]["employer_id"] == 1
    progress = json.loads((tmp_path / "identity-review-progress.json").read_text())
    assert progress["checked"] == 1 and not progress["completed"]
    assert not json.loads((tmp_path / "identity-review.json").read_text())["completed"]


def test_closed_company_number_evidence_stays_uncertain():
    p = pair()
    for f in p["facts"]:
        if f["id"] == "candidate.status":
            f["value"] = "Dissolved"
    result = review.validate_decisions({"decisions": [decision(p)]}, [p])[0]
    assert result["decision"] == "insufficient_evidence"
