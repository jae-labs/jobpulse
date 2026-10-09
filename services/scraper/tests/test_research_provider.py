"""Provider cost, payload, citation and response boundaries use synthetic fixtures."""

import json

import httpx
import pytest

from jobpulse_scraper.company_index import review
from jobpulse_scraper.company_index.benchmark import identity_cases, score
from jobpulse_scraper.pipeline import research_provider as provider


def mock_api(monkeypatch, handler):
    monkeypatch.setattr(
        provider,
        "_dispatch",
        lambda prompt, schema, model, timeout, selected: provider._request(prompt, schema, model, timeout),
    )
    original = httpx.Client
    monkeypatch.setenv("OPENCODE_API_KEY", "synthetic-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-private-secret")
    monkeypatch.setattr(provider.httpx, "Client", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))


def response(data=None, **extra):
    return httpx.Response(
        200,
        json={
            "choices": [{"message": {"content": json.dumps(data or {"decisions": []})}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30},
            **extra,
        },
    )


def test_fixed_destination_and_safe_metadata(monkeypatch, capsys):
    def handler(request):
        assert str(request.url) == provider.ZEN_ENDPOINT
        assert "synthetic-private-secret" not in request.content.decode()
        assert json.loads(request.content)["model"] == provider.FREE_MODEL
        return response()

    mock_api(monkeypatch, handler)
    result = provider.request_json("Public synthetic evidence", {})
    assert result["usage"]["total_tokens"] == 30
    assert not result["fallback_used"]
    output = capsys.readouterr().out
    assert "synthetic-key" not in output and "Public synthetic evidence" not in output


def test_paid_and_unknown_models_make_no_requests(monkeypatch):
    mock_api(monkeypatch, lambda _: pytest.fail("No requests allowed"))
    for selected in [provider.PAID_MODEL, "unexpected"]:
        with pytest.raises(ValueError):
            provider.request_json("synthetic", {}, model=selected)
    with pytest.raises(ValueError):
        provider.request_json("synthetic", {}, fallback_model=provider.PAID_MODEL)


def test_throttle_does_not_implicitly_spend(monkeypatch, capsys):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(429, text="synthetic-private-provider-error")

    mock_api(monkeypatch, handler)
    with pytest.raises(provider.ProviderFailure, match="http_429"):
        provider.request_json("synthetic", {})
    assert len(calls) == 1
    assert "synthetic-private-provider-error" not in capsys.readouterr().out


def test_explicit_paid_fallback_records_actual_model(monkeypatch):
    calls = []

    def handler(request):
        calls.append(json.loads(request.content)["model"])
        return httpx.Response(503) if len(calls) == 1 else response()

    mock_api(monkeypatch, handler)
    result = provider.request_json("synthetic", {}, fallback_model=provider.PAID_MODEL, allow_paid=True)
    assert calls == [provider.FREE_MODEL, provider.PAID_MODEL]
    assert result["fallback_used"] and result["model"] == provider.PAID_MODEL
    assert result["primary_failure"] == "http_503"


@pytest.mark.parametrize(
    "bad",
    [
        httpx.Response(200, text="not JSON"),
        httpx.Response(302, headers={"Location": "https://foreign.example"}),
        httpx.Response(200, content=b"x" * (256 * 1024 + 1)),
    ],
)
def test_invalid_redirect_and_oversize_never_trigger_paid_retry(monkeypatch, bad):
    calls = []

    def handler(request):
        calls.append(request)
        return bad

    mock_api(monkeypatch, handler)
    with pytest.raises(provider.ProviderFailure):
        provider.request_json("synthetic", {}, fallback_model=provider.PAID_MODEL, allow_paid=True)
    assert len(calls) == 1


def test_opencode_identity_uses_existing_negative_validation(tmp_path, monkeypatch):
    case = identity_cases()[0]
    raw = {
        "decisions": [
            {
                "pair_id": case["pair"]["pair_id"],
                "decision": "same_company",
                "relationship": "same_entity",
                "reason": "invented",
                "citations": [{"fact_id": "not_supplied", "quote": "42"}],
            }
        ]
    }
    mock_api(monkeypatch, lambda _: response(raw))
    with pytest.raises(ValueError, match="invented evidence"):
        review.AgyReviewer(tmp_path, provider="opencode", model=provider.FREE_MODEL).compare([case["pair"]])
    assert not list(tmp_path.glob("*.json"))


def test_provider_cache_retains_acquisition_and_isolates_policy(tmp_path, monkeypatch):
    case = identity_cases()[4]
    raw = {
        "decisions": [
            {
                "pair_id": case["pair"]["pair_id"],
                "decision": "insufficient_evidence",
                "relationship": "unknown",
                "reason": "name only",
                "citations": [],
            }
        ]
    }
    calls = []

    def handler(request):
        calls.append(request)
        return response(raw)

    mock_api(monkeypatch, handler)
    reviewer = review.AgyReviewer(tmp_path, provider="opencode", model=provider.FREE_MODEL)
    reviewer.compare([case["pair"]])
    reviewer.compare([case["pair"]])
    assert len(calls) == 1 and reviewer.provider_runs[-1]["cache_hit"]
    assert reviewer.provider_runs[-1]["model"] == provider.FREE_MODEL
    review.AgyReviewer(
        tmp_path, provider="opencode", model=provider.FREE_MODEL, fallback_model=provider.PAID_MODEL, allow_paid=True
    ).compare([case["pair"]])
    assert len(calls) == 2


def test_benchmark_detects_false_positive_and_downgrade():
    cases = identity_cases()
    assert len(cases) == 32 and len({c["pair"]["pair_id"] for c in cases}) == 32
    c = cases[4]
    metrics = score([{"pair_id": c["pair"]["pair_id"], "decision": "same_company"}], cases)
    assert metrics["false_positive_identity"] == 1 and metrics["correct"] == 0
    metrics = score(
        [{"pair_id": c["pair"]["pair_id"], "decision": "insufficient_evidence", "model_decision": "same_company"}],
        cases,
    )
    assert metrics["correct"] == 1 and metrics["raw_correct"] == 0


def test_genuine_go_client_has_no_tools_or_conversation_reuse(monkeypatch):
    from types import SimpleNamespace

    from jobpulse_scraper.pipeline import research_opencode as client

    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-private-secret")
    monkeypatch.setattr(client.shutil, "which", lambda _: "synthetic-opencode")
    workspaces = []

    def run(command, **kwargs):
        workspaces.append(kwargs["cwd"])
        assert "--standalone" in command and "opencode-go/" + provider.FREE_MODEL in command
        assert not set(command) & {"--auto", "--continue", "--session", "--server"}
        assert "SUPABASE_SERVICE_ROLE_KEY" not in kwargs["env"]
        config = json.loads(kwargs["env"]["OPENCODE_CONFIG_CONTENT"])
        assert config["permission"] == "deny"
        assert config["agent"]["research"]["permission"] == "deny"
        assert config["share"] == "disabled" and config["plugin"] == []
        assert config["enabled_providers"] == ["opencode-go"]
        assert kwargs["env"]["OPENCODE_DISABLE_CLAUDE_CODE"] == "true"
        # Go's client resolves the configured credential store; no credentials are copied into the workspace.
        assert not (kwargs["cwd"] / "data/opencode/auth.json").exists()
        kwargs["stdout"].write(json.dumps({"type": "text", "part": {"text": '{"ok":true}'}}) + "\n")
        kwargs["stdout"].flush()
        return SimpleNamespace(pid=987654321, returncode=0, poll=lambda: 0, wait=lambda: 0)

    monkeypatch.setattr(client.subprocess, "Popen", run)
    result = client.request("synthetic", {}, provider.FREE_MODEL, 1, provider="opencode-go")
    assert result["data"] == {"ok": True} and result["provider"] == "opencode-go"
    assert result["usage"] == {}  # Missing client usage stays unknown.
    assert not workspaces[0].exists()


def test_client_tools_and_error_payloads_are_rejected():
    from jobpulse_scraper.pipeline.research_opencode import decode_events

    for output, category in [
        ({"type": "tool_use", "part": {"type": "tool"}}, "unexpected_tool_use"),
        ({"type": "error", "error": {"status": 403, "message": "synthetic-private-error"}}, "http_403"),
        ({"type": "step_finish", "part": {"reason": "length"}}, "incomplete_response"),
    ]:
        with pytest.raises(provider.ProviderFailure, match=category):
            decode_events(json.dumps(output))


def test_client_timeout_kills_process_group(monkeypatch):
    import signal
    from types import SimpleNamespace

    from jobpulse_scraper.pipeline import research_opencode as client

    monkeypatch.setattr(client.shutil, "which", lambda _: "synthetic-opencode")
    monkeypatch.setattr(
        client.subprocess,
        "Popen",
        lambda *a, **kw: SimpleNamespace(pid=987654321, returncode=None, poll=lambda: None, wait=lambda: 0),
    )
    times = iter([0.0, 2.0])
    monkeypatch.setattr(client.time, "monotonic", lambda: next(times))
    # The progress helper uses the shared time module; avoid consuming the synthetic clock there.
    from contextlib import nullcontext

    monkeypatch.setattr(client, "progress", lambda *a, **kw: nullcontext())
    killed = []
    monkeypatch.setattr(client.os, "killpg", lambda pid, sig: killed.append((pid, sig)))
    with pytest.raises(provider.ProviderFailure, match="deadline_exceeded"):
        client.request("synthetic", {}, provider.FREE_MODEL, 1, provider="opencode-go")
    assert killed == [(987654321, signal.SIGKILL)]


def test_single_json_fence_preserves_strict_object_parsing():
    from jobpulse_scraper.pipeline.research_opencode import decode_events

    raw, _ = decode_events(json.dumps({"type": "text", "part": {"text": '```json\n{"ok":true}\n```'}}))
    assert raw == {"ok": True}
    for text in ['explanation\n```json\n{"ok":true}\n```', '```json\n{"ok":}\n```', "```json\n[]\n```"]:
        with pytest.raises(provider.ProviderFailure, match="invalid_json_response"):
            decode_events(json.dumps({"type": "text", "part": {"text": text}}))


def test_empty_unknown_citation_is_rejected_without_repair(tmp_path, monkeypatch):
    case = identity_cases()[4]
    raw = {
        "decisions": [
            {
                "pair_id": case["pair"]["pair_id"],
                "decision": "insufficient_evidence",
                "relationship": "unknown",
                "reason": "unknown",
                "citations": [{"fact_id": "employer.company_number", "quote": ""}],
            }
        ]
    }
    mock_api(monkeypatch, lambda _: response(raw))
    with pytest.raises(ValueError):
        review.AgyReviewer(tmp_path, provider="opencode", model=provider.FREE_MODEL).compare([case["pair"]])
    assert not list(tmp_path.glob("*.json"))


def test_opencode_candidate_budget_preserves_complete_pair_coverage(tmp_path, monkeypatch):
    observed = []
    pairs = [c["pair"] for c in identity_cases()[:9]]

    def request(prompt, schema, **kwargs):
        batch = json.loads(prompt.split("\nDATA:\n")[1])
        assert len(batch) <= 4
        observed.extend(p["pair_id"] for p in batch)
        raw = {
            "decisions": [
                {
                    "pair_id": p["pair_id"],
                    "decision": "insufficient_evidence",
                    "relationship": "unknown",
                    "reason": "synthetic",
                    "citations": [],
                }
                for p in batch
            ]
        }
        return {"data": raw, "provider": "opencode-go", "model": provider.FREE_MODEL, "fallback_used": False}

    monkeypatch.setattr(review, "request_json", request)
    reviewer = review.AgyReviewer(tmp_path, provider="opencode-go", model=provider.FREE_MODEL)
    results = reviewer.compare(pairs)
    assert observed == [p["pair_id"] for p in pairs]
    assert [r["pair_id"] for r in results] == observed
    assert reviewer.calls == 3
