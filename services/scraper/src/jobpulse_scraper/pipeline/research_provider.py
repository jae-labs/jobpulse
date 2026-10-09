"""Bounded OpenCode research calls with explicit cost policy and safe diagnostics."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx

from jobpulse_scraper.pipeline.research_progress import event, progress

FREE_MODEL = "longcat-2.5-preview-free"
FREE_MODELS = frozenset({FREE_MODEL, "step-5-preview-free"})
PAID_MODEL = "glm-5.3-flash"
PAID_MODELS = frozenset({PAID_MODEL, "mimo-v2.6-flash", "deepseek-v4.1-flash"})
ZEN_ENDPOINT = "https://opencode.ai/zen/v1/chat/completions"


class ProviderFailure(RuntimeError):
    def __init__(self, category: str):
        super().__init__(category)
        self.category = category


def model_id(model: str) -> str:
    return model.removeprefix("opencode/").removeprefix("opencode-go/")


def validate_policy(model: str, fallback_model: str | None, allow_paid: bool) -> None:
    for selected in [model, *([fallback_model] if fallback_model else [])]:
        if model_id(selected) not in FREE_MODELS | PAID_MODELS:
            raise ValueError("Unsupported research model; use the supported allowlist")
        if model_id(selected) not in FREE_MODELS and not allow_paid:
            raise ValueError("Paid research models require --allow-paid")


def zen_key() -> str:
    key = os.environ.get("OPENCODE_API_KEY")
    if not key:
        path = Path.home() / ".local/share/opencode/auth.json"
        try:
            entry = json.loads(path.read_text(encoding="utf-8")).get("opencode", {})
            key = entry.get("key") if entry.get("type") == "api" else None
        except (OSError, ValueError, AttributeError):
            key = None
    if not isinstance(key, str) or not key.strip():
        raise ProviderFailure("opencode_credential_missing")
    return key


def _request(prompt: str, schema: dict, model: str, timeout: int) -> dict:
    if not 1 <= timeout <= 300:
        raise ValueError("Provider timeout must be 1–300 seconds")
    payload = {
        "model": model_id(model),
        "messages": [
            {
                "role": "system",
                "content": "Return only a JSON object matching the supplied schema. No tools or actions are available.",
            },
            {"role": "user", "content": prompt + "\nOUTPUT JSON SCHEMA:\n" + json.dumps(schema)},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 8192,
    }
    if len(json.dumps(payload).encode()) > 160 * 1024:
        raise ValueError("Research request exceeds 160 KiB")
    started = time.monotonic()
    headers = {"Authorization": "Bearer " + zen_key(), "User-Agent": "JobPulse-company-research/1.0"}
    try:
        with (
            progress("opencode_request", model=model_id(model)),
            httpx.Client(
                timeout=httpx.Timeout(timeout, connect=min(timeout, 20)), trust_env=False, follow_redirects=False
            ) as client,
        ):
            with client.stream("POST", ZEN_ENDPOINT, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    raise ProviderFailure(f"http_{response.status_code}")
                data = bytearray()
                for block in response.iter_bytes():
                    if time.monotonic() - started > timeout:
                        raise ProviderFailure("deadline_exceeded")
                    data.extend(block)
                    if len(data) > 256 * 1024:
                        raise ProviderFailure("response_budget_exceeded")
        wrapper = json.loads(data)
        choice = wrapper["choices"][0]
        if choice.get("finish_reason") not in {None, "stop"}:
            raise ProviderFailure("incomplete_response")
        raw = json.loads(choice["message"]["content"])
        if not isinstance(raw, dict):
            raise ValueError("Expected JSON object")
    except httpx.TimeoutException:
        raise ProviderFailure("network_timeout") from None
    except httpx.HTTPError:
        raise ProviderFailure("network_error") from None
    except (ValueError, KeyError, IndexError, TypeError):
        raise ProviderFailure("invalid_json_response") from None
    usage = wrapper.get("usage") or {}
    metadata = {
        "provider": "opencode",
        "model": model_id(model),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "usage": {
            k: usage[k] for k in ("prompt_tokens", "completion_tokens", "total_tokens") if type(usage.get(k)) is int
        },
    }
    event("provider_outcome", **metadata)
    return {"data": raw, **metadata}


def _dispatch(prompt: str, schema: dict, model: str, timeout: int, provider: str = "opencode") -> dict:
    if provider == "opencode-go" or model_id(model) in FREE_MODELS:
        from jobpulse_scraper.pipeline.research_opencode import request

        return request(prompt, schema, model, timeout, provider=provider)
    return _request(prompt, schema, model, timeout)


def request_json(
    prompt: str,
    schema: dict,
    *,
    model: str = FREE_MODEL,
    timeout: int = 120,
    fallback_model: str | None = None,
    allow_paid: bool = False,
    provider: str = "opencode",
) -> dict:
    if provider not in {"opencode", "opencode-go"}:
        raise ValueError("Unknown OpenCode provider")
    validate_policy(model, fallback_model, allow_paid)
    try:
        result = _dispatch(prompt, schema, model, timeout, provider)
        return {**result, "fallback_used": False}
    except ProviderFailure as exc:
        event("provider_failed", provider=provider, model=model_id(model), category=exc.category)
        # Invalid/truncated claims do not trigger a billable second opinion.
        if not fallback_model or exc.category not in {
            "http_429",
            "http_502",
            "http_503",
            "http_504",
            "network_timeout",
            "network_error",
        }:
            raise
        result = _dispatch(prompt, schema, fallback_model, timeout, provider)
        return {**result, "fallback_used": True, "primary_failure": exc.category}


def add_provider_arguments(parser) -> None:
    parser.add_argument("--provider", choices=["agy", "opencode", "opencode-go"], default="agy")
    parser.add_argument("--model", help="Provider model; defaults to Gemini for agy or LongCat Free for OpenCode")
    parser.add_argument("--fallback-model", help="Optional OpenCode fallback; paid models require --allow-paid")
    parser.add_argument("--allow-paid", action="store_true", help="Explicitly permit a paid OpenCode model/fallback")


def resolve_provider_arguments(args) -> None:
    args.model = args.model or (FREE_MODEL if args.provider != "agy" else "gemini-3.8-flash-low")
    if args.provider != "agy":
        validate_policy(args.model, args.fallback_model, args.allow_paid)
    elif args.fallback_model or args.allow_paid:
        raise ValueError("Paid fallback policy is available only for OpenCode")
