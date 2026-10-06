"""Behavioral regressions for full-body ingestion and in-place catalog repair."""

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from database import repository
from engine.description_quality import has_closed_notice, has_description_body, needs_description_repair
from extractors import general, jobsireland, smartrecruiters, universal
from scrapers.providers import extract_greenhouse_opportunities, extract_lever_opportunities
from tools import repair_descriptions as repair

BODY = "Design distributed systems and operate production services. " * 20 + "TAIL: Kubernetes and PostgreSQL required."


@pytest.mark.parametrize(
    "notice",
    [
        "position has been filled",
        "job is no longer available",
        "position has expired",
        "job is closed",
        "no longer accepting applications",
    ],
)
def test_closure_notices_are_rejected_by_body_and_ingestion_gates(notice, monkeypatch):
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *args: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *args: True)
    description = f"{BODY}\n{notice.upper()}"
    assert has_closed_notice(description)
    assert not has_description_body(description)
    assert not repository._is_ingestable_job({"description": description})


@pytest.mark.parametrize("description", ["", BODY])
def test_missing_or_open_content_is_not_a_closure_notice(description, monkeypatch):
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *args: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *args: True)
    assert not has_closed_notice(description)
    assert repository._is_ingestable_job({"description": description})


class Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def read(self):
        return json.dumps(self.payload).encode()


def test_long_metadata_is_not_a_body() -> None:
    metadata = "JobsIreland Vacancy Reference: #JOB-1\nEmployer: Example\n" + "Location: Dublin " * 50
    assert needs_description_repair(metadata)
    assert not has_description_body(metadata)
    assert has_description_body(BODY)


def test_jobsireland_extracts_only_published_description(monkeypatch) -> None:
    monkeypatch.setattr(
        jobsireland,
        "fetch_page",
        lambda _: (
            f"""<main>Cookie notice
        <pre ng-bind-html="Description | linky">{BODY}</pre>Related jobs</main>"""
        ),
    )
    assert (
        jobsireland.extract_jobsireland_job_spec("https://jobsireland.ie/en-US/job-Details?id=1")["description"] == BODY
    )
    monkeypatch.setattr(jobsireland, "fetch_page", lambda _: "<main>Search jobs and register</main>")
    assert jobsireland.extract_jobsireland_job_spec("https://jobsireland.ie/en-US/job-Details?id=1") == {}


def test_smartrecruiters_keeps_qualifications_and_tail(monkeypatch) -> None:
    requests = []

    def fetch(request, **_kwargs):
        requests.append(request.full_url)
        return Response(
            {
                "jobAd": {
                    "sections": {
                        "jobDescription": {"text": f"<p>{BODY}</p>"},
                        "qualifications": {"text": "<p>TAIL QUALIFICATION</p>"},
                        "additionalInformation": {"text": "<p>Hybrid working</p>"},
                    }
                }
            }
        )

    monkeypatch.setattr(smartrecruiters, "urlopen", fetch)
    spec = smartrecruiters.extract_smartrecruiters_job_spec("https://jobs.smartrecruiters.com/Example/123-title")
    assert "TAIL QUALIFICATION" in spec["description"]
    assert "Hybrid working" in spec["description"]
    assert requests == ["https://api.smartrecruiters.com/v1/companies/Example/postings/123"]


def test_greenhouse_preserves_api_body_beyond_old_cap(monkeypatch) -> None:
    from scrapers.providers import greenhouse

    monkeypatch.setattr(
        greenhouse,
        "urlopen",
        lambda *_args, **_kwargs: Response(
            {
                "jobs": [
                    {
                        "id": 1,
                        "title": "Engineer",
                        "location": {"name": "Dublin"},
                        "content": BODY,
                    }
                ]
            }
        ),
    )
    assert extract_greenhouse_opportunities("Example", "https://boards.greenhouse.io/example")[0]["description"] == BODY


def test_lever_includes_list_sections_and_additional_text(monkeypatch) -> None:
    from scrapers.providers import lever

    monkeypatch.setattr(
        lever,
        "urlopen",
        lambda *_args, **_kwargs: Response(
            [
                {
                    "text": "Engineer",
                    "categories": {"location": "Dublin"},
                    "hostedUrl": "https://jobs.lever.co/example/1",
                    "descriptionPlain": BODY,
                    "lists": [{"text": "Requirements", "content": "<li>TAIL QUALIFICATION</li>"}],
                    "additionalPlain": "Hybrid working",
                }
            ]
        ),
    )
    body = extract_lever_opportunities("Example", "https://jobs.lever.co/example")[0]["description"]
    assert "TAIL QUALIFICATION" in body and "Hybrid working" in body
    assert "TAIL: Kubernetes" in body


def test_general_prefers_jobposting_over_navigation(monkeypatch) -> None:
    payload = {"@type": "JobPosting", "title": "Engineer", "description": BODY}
    monkeypatch.setattr(
        general,
        "fetch_page",
        lambda _: (
            f"""<script type="application/ld+json">{json.dumps(payload)}</script>
        <main>Register for job alerts. Cookie preferences.</main>"""
        ),
    )
    assert general.extract_general_job_detail("https://example.com/job", "Example", "Engineer")["description"] == BODY


def test_default_ingestion_hydrates_long_metadata(monkeypatch) -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    client.table.return_value.upsert.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *_: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *_: True)
    fetch = MagicMock(return_value={"description": BODY})
    monkeypatch.setattr(universal, "extract_universal_job_spec", fetch)
    repository.save_jobs_batch(
        [
            {
                "title": "Engineer",
                "company": "Example",
                "source": "Example",
                "url": "https://example.com/job",
                "description": "JobsIreland Vacancy Reference: " + "Metadata " * 60,
            }
        ]
    )
    fetch.assert_called_once()
    assert "TAIL: Kubernetes" in client.table.return_value.upsert.call_args.args[0][0]["description"]


def test_failed_detail_cannot_erase_existing_body(monkeypatch) -> None:
    client = MagicMock()
    job = {
        "title": "Engineer",
        "company": "Example",
        "url": "https://example.com/job",
        "source": "Example",
        "description": "Example position: Engineer. Location: Dublin.",
    }
    key = repository.normalized_key("Example", "Engineer", job["url"])
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(
        data=[{"dedupe_key": key, "description": BODY}]
    )
    client.table.return_value.upsert.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *_: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *_: True)
    monkeypatch.setattr(universal, "extract_universal_job_spec", lambda *_: {})
    repository.save_jobs_batch([job])
    assert client.table.return_value.upsert.call_args.args[0][0]["description"] == BODY


@pytest.mark.parametrize("apply", [False, True])
def test_repair_keeps_identity_tracking_and_last_seen(monkeypatch, tmp_path: Path, apply: bool) -> None:
    job = {
        "id": 7,
        "title": "Engineer",
        "company": "Example",
        "source": "Example",
        "description": "stub",
        "url": "https://example.com/job",
        "last_seen_at": "old",
    }
    client = MagicMock()
    client.table.return_value.select.return_value.gt.return_value.order.return_value.limit.return_value.execute.side_effect = [
        SimpleNamespace(data=[job]),
        SimpleNamespace(data=[]),
    ]
    client.table.return_value.update.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{**job, "description": BODY}]
    )
    monkeypatch.setattr(repair, "get_supabase", lambda: client)
    monkeypatch.setattr(repair, "extract_universal_job_spec", lambda *_: {"description": BODY})
    embed = MagicMock()
    monkeypatch.setattr(repair, "prepare_embeddings", embed)
    counts = repair.repair_descriptions(apply=apply, report=tmp_path / "report.csv")
    assert counts["recovered"] == 1
    if apply:
        assert counts["updated"] == 1
        assert set(client.table.return_value.update.call_args.args[0]) == {"description"}
        embed.assert_called_once()
    else:
        client.table.return_value.update.assert_not_called()
        embed.assert_not_called()
    client.rpc.assert_not_called()
    client.table.return_value.delete.assert_not_called()


def test_general_preserves_nested_container_tail(monkeypatch) -> None:
    monkeypatch.setattr(
        general,
        "fetch_page",
        lambda _: (
            f"""<nav>Cookie options</nav>
        <div class="job-description"><p>{BODY}</p><div><p>Nested duties</p></div>
        <p>FINAL REQUIREMENT</p></div><footer>Related jobs</footer>"""
        ),
    )
    result = general.extract_general_job_detail("https://example.com/job", "Example", "Engineer")["description"]
    assert "FINAL REQUIREMENT" in result
    assert "Cookie options" not in result and "Related jobs" not in result


def test_unscoped_page_is_not_a_published_job_body(monkeypatch) -> None:
    monkeypatch.setattr(general, "fetch_page", lambda _: f"<nav>{BODY}</nav><footer>Search all jobs</footer>")
    assert general.extract_general_job_detail("https://example.com/job", "Example", "Engineer") == {}


def test_missing_detail_does_not_create_or_embed_stub(monkeypatch) -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *_: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *_: True)
    monkeypatch.setattr(universal, "extract_universal_job_spec", lambda *_: {})
    embed = MagicMock()
    monkeypatch.setattr(repository, "prepare_embeddings", embed)
    assert (
        repository.save_jobs_batch(
            [
                {
                    "title": "Engineer",
                    "company": "Example",
                    "source": "Example",
                    "url": "https://example.com/job",
                    "description": "Example position: Engineer.",
                }
            ]
        )
        == 0
    )
    client.table.return_value.upsert.assert_not_called()
    embed.assert_not_called()


def test_failed_existing_read_cannot_fall_through_to_stub_write(monkeypatch) -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.in_.return_value.execute.side_effect = RuntimeError("unavailable")
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *_: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *_: True)
    with pytest.raises(RuntimeError, match="unavailable"):
        repository.save_jobs_batch(
            [
                {
                    "title": "Engineer",
                    "company": "Example",
                    "source": "Example",
                    "url": "https://example.com/job",
                    "description": BODY,
                }
            ],
            enrich=False,
        )
    client.table.return_value.upsert.assert_not_called()


def test_amazon_recovery_matches_exact_posting_id(monkeypatch) -> None:
    from extractors import api_details

    monkeypatch.setattr(
        api_details,
        "_get_json",
        lambda _: {
            "jobs": [
                {"id_icims": "999", "description": "Unrelated role"},
                {"id_icims": "123", "description": BODY, "basic_qualifications": "FINAL QUALIFICATION"},
            ]
        },
    )
    body = api_details.extract_api_job_spec("https://www.amazon.jobs/en/jobs/123/engineer", "Example")["description"]
    assert "FINAL QUALIFICATION" in body and "Unrelated role" not in body
    assert api_details.extract_api_job_spec("https://www.amazon.jobs/en/jobs/456/engineer", "Example") == {}


def test_oracle_keeps_role_responsibilities_and_qualifications(monkeypatch) -> None:
    from extractors import api_details

    calls = []

    def fetch(url):
        calls.append(url)
        return {
            "items": [
                {
                    "ExternalDescriptionStr": BODY,
                    "ExternalResponsibilitiesStr": "Operate systems",
                    "ExternalQualificationsStr": "FINAL QUALIFICATION",
                }
            ]
        }

    monkeypatch.setattr(api_details, "_get_json", fetch)
    body = api_details.extract_api_job_spec(
        "https://example.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions/preview/123", "Example"
    )["description"]
    assert "Operate systems" in body and "FINAL QUALIFICATION" in body
    assert "recruitingCEJobRequisitionDetails" in calls[0]


def test_custom_greenhouse_url_uses_configured_board(monkeypatch) -> None:
    from extractors import api_details

    monkeypatch.setattr(
        api_details,
        "get_employers_tuples",
        lambda: [("Example", "Tech", 50, "https://job-boards.greenhouse.io/example")],
    )
    calls = []

    def fetch(url):
        calls.append(url)
        return {"id": 123, "content": BODY}

    monkeypatch.setattr(api_details, "_get_json", fetch)
    assert api_details.extract_api_job_spec("https://example.com/careers?gh_jid=123", "Example")["description"] == BODY
    assert calls == ["https://boards-api.greenhouse.io/v1/boards/example/jobs/123"]


def test_later_batch_stub_cannot_discard_hydrated_body(monkeypatch) -> None:
    client = MagicMock()
    client.table.return_value.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(data=[])
    client.table.return_value.upsert.return_value.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(repository, "get_supabase", lambda: client)
    monkeypatch.setattr(repository, "is_valid_job_title", lambda *_: True)
    monkeypatch.setattr(repository, "is_valid_location", lambda *_: True)
    job = {"title": "Engineer", "company": "Example", "source": "Example", "url": "https://example.com/job"}
    repository.save_jobs_batch(
        [{**job, "description": BODY}, {**job, "description": "Example position: Engineer."}], enrich=False
    )
    payload = client.table.return_value.upsert.call_args.args[0]
    assert len(payload) == 1 and "TAIL: Kubernetes" in payload[0]["description"]


def test_pdf_body_keeps_late_pages_and_text_beyond_old_cap(monkeypatch) -> None:
    from io import BytesIO

    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    from extractors import pdf

    writer = PdfWriter()
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    for index in range(17):
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        content = DecodedStreamObject()
        text = BODY * 2 + (" FINAL_PAGE_REQUIREMENT" if index == 16 else "")
        content.set_data(f"BT /F1 12 Tf 50 700 Td ({text}) Tj ET".encode())
        page[NameObject("/Contents")] = content
    output = BytesIO()
    writer.write(output)

    class PDFResponse(Response):
        def read(self):
            return output.getvalue()

    monkeypatch.setattr(pdf, "urlopen", lambda *_args, **_kwargs: PDFResponse(None))
    spec = pdf.extract_pdf_job_spec("https://example.com/booklet.pdf", "Engineer")
    assert spec["description"] is not None
    assert len(spec["description"]) > 25000
    assert spec["description"].endswith("FINAL_PAGE_REQUIREMENT")


def test_source_can_publish_a_shorter_complete_body(monkeypatch) -> None:
    published = "Operate and maintain production systems for our engineering team. " * 2
    monkeypatch.setattr(repair, "extract_universal_job_spec", lambda *_: {"description": published})
    job = {"title": "Engineer", "company": "Example", "url": "https://example.com/job", "description": BODY}
    assert repair.recover_description(job) == published.strip()


def test_concurrent_refresh_is_reported_and_not_embedded(monkeypatch, tmp_path: Path) -> None:
    job = {
        "id": 7,
        "title": "Engineer",
        "company": "Example",
        "source": "Example",
        "description": "stub",
        "url": "https://example.com/job",
    }
    client = MagicMock()
    client.table.return_value.select.return_value.gt.return_value.order.return_value.limit.return_value.execute.side_effect = [
        SimpleNamespace(data=[job]),
        SimpleNamespace(data=[]),
    ]
    client.table.return_value.update.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )
    monkeypatch.setattr(repair, "get_supabase", lambda: client)
    monkeypatch.setattr(repair, "extract_universal_job_spec", lambda *_: {"description": BODY})
    embed = MagicMock()
    monkeypatch.setattr(repair, "prepare_embeddings", embed)
    result = repair.repair_descriptions(apply=True, report=tmp_path / "report.csv")
    assert result["conflicts"] == 1 and result["updated"] == 0
    embed.assert_not_called()
    assert "concurrent_change" in (tmp_path / "report.csv").read_text()


def test_long_aggregator_snippet_still_fetches_detail(monkeypatch) -> None:
    job = {
        "title": "Engineer",
        "company": "Example",
        "url": "https://example.com/job",
        "description": BODY,
        "description_is_snippet": True,
    }
    fetch = MagicMock(return_value={"description": BODY + " Full source duties."})
    monkeypatch.setattr(universal, "extract_universal_job_spec", fetch)
    result = repository._enrich_job(job)
    fetch.assert_called_once()
    assert result["description"].endswith("Full source duties.")
    monkeypatch.setattr(universal, "extract_universal_job_spec", lambda *_: {})
    assert repository._enrich_job(job)["description"] == ""


def test_generic_careers_landing_page_is_not_a_job_body(monkeypatch) -> None:
    monkeypatch.setattr(
        general, "fetch_page", lambda _: f"<main>Careers at Example. Search all open roles. {BODY}</main>"
    )
    assert general.extract_general_job_detail("https://example.com/job", "Example", "Engineer") == {}


def test_dedicated_body_wins_over_main_navigation(monkeypatch) -> None:
    monkeypatch.setattr(
        general,
        "fetch_page",
        lambda _: (
            f"""<main>Related jobs and cookie preferences
        <div class="job-description"><p>{BODY}</p><br/><p>FINAL REQUIREMENT</p></div>Footer navigation</main>"""
        ),
    )
    body = general.extract_general_job_detail("https://example.com/job", "Example", "Engineer")["description"]
    assert "FINAL REQUIREMENT" in body and "Related jobs" not in body and "Footer navigation" not in body


def test_related_jobposting_cannot_replace_requested_role(monkeypatch) -> None:
    monkeypatch.setattr(
        general,
        "fetch_page",
        lambda _: (
            f"""<script type="application/ld+json">
        {json.dumps({"@type": "JobPosting", "title": "Accountant", "description": BODY})}</script>"""
        ),
    )
    assert general.extract_general_job_detail("https://example.com/job", "Example", "Engineer") == {}


def test_short_published_workday_body_is_not_discarded(monkeypatch) -> None:
    from extractors import workday_cxs

    published = "Maintain reliable production services and support our customers. " * 2
    monkeypatch.setattr(
        workday_cxs,
        "urlopen",
        lambda *_args, **_kwargs: Response(
            {"jobPostingInfo": {"jobDescription": published, "location": "Dublin", "timeType": "Full time"}}
        ),
    )
    url = "https://example.wd5.myworkdayjobs.com/en-US/careers/job/1"
    assert universal.extract_universal_job_spec(url, "Example", "Engineer")["description"] == published.strip()


def test_hubspot_custom_detail_uses_current_public_board(monkeypatch) -> None:
    from extractors import api_details

    calls = []

    def fetch(url):
        calls.append(url)
        return {"id": 123, "content": BODY}

    monkeypatch.setattr(api_details, "_get_json", fetch)
    assert (
        api_details.extract_api_job_spec("https://www.hubspot.com/careers/jobs/123", "HubSpot")["description"] == BODY
    )
    assert calls == ["https://boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs/123"]
    assert api_details.extract_api_job_spec("https://www.hubspot.com/careers/jobs/all", "HubSpot") == {}


def test_confirmed_short_published_body_is_saved_but_still_fails_embedding_gate(monkeypatch) -> None:
    short_body = "Assist with childcare and supervise play activities."
    monkeypatch.setattr(
        repair,
        "extract_universal_job_spec",
        lambda *_: {"description": short_body, "description_origin": "published_detail"},
    )
    assert (
        repair.recover_description({"url": "https://example.com/job", "company": "Example", "title": "Assistant"})
        == short_body
    )
    assert not has_description_body(short_body)
    monkeypatch.setattr(repair, "extract_universal_job_spec", lambda *_: {"description": short_body})
    assert (
        repair.recover_description({"url": "https://example.com/job", "company": "Example", "title": "Assistant"})
        is None
    )


def test_jobsireland_rejects_a_different_vacancy_reference(monkeypatch) -> None:
    monkeypatch.setattr(
        jobsireland,
        "fetch_page",
        lambda _: f'<input id="JobReference" value="#JOB-2"><pre ng-bind-html="Description | linky">{BODY}</pre>',
    )
    assert jobsireland.extract_jobsireland_job_spec("https://jobsireland.ie/en-US/job-Details?id=1") == {}


def test_coverage_audit_detects_vector_drift_and_never_confirms_dry_runs(monkeypatch, tmp_path) -> None:
    from tools import audit_descriptions as audit

    jobs = [
        {
            "id": 1,
            "source": "Example Feed",
            "title": "Engineer",
            "description": BODY,
            "url": "https://example.com/1",
        },
        {"id": 2, "source": "Example", "title": "Assistant", "description": "stub", "url": "https://example.com/2"},
        {
            "id": 3,
            "source": "JobsIreland.ie",
            "title": "Assistant",
            "description": "Assist with classroom activities.",
            "url": "https://example.com/3",
        },
    ]
    jobs_table = MagicMock()
    jobs_table.select.return_value.gt.return_value.order.return_value.limit.return_value.execute.side_effect = [
        SimpleNamespace(data=jobs),
        SimpleNamespace(data=[]),
    ]
    vectors_table = MagicMock()
    vectors_table.select.return_value.in_.return_value.execute.return_value = SimpleNamespace(
        data=[
            {"job_id": 1, "content_hash": "current", "model_version": audit.EMBEDDING_MODEL_VERSION},
            {"job_id": 2, "content_hash": "stale", "model_version": audit.EMBEDDING_MODEL_VERSION},
        ]
    )
    client = MagicMock()
    client.table.side_effect = lambda name: jobs_table if name == "jobs" else vectors_table
    monkeypatch.setattr(audit, "get_supabase", lambda: client)
    monkeypatch.setattr(audit, "job_scoring_hash", lambda _: "current")
    repairs = tmp_path / "repairs.csv"
    repairs.write_text("id,outcome\n1,would_update\n3,updated\n")
    result = audit.audit_descriptions(
        report=tmp_path / "audit.csv", summary=tmp_path / "summary.json", repair_reports=[repairs]
    )
    assert result["counts"]["stale_or_invalid_vectors"] == 1
    assert result["counts"]["published_short"] == 1
    assert {call.args[0] for call in client.table.call_args_list} == {"jobs", "job_scoring_embeddings"}
    jobs_table.update.assert_not_called()
    vectors_table.delete.assert_not_called()
