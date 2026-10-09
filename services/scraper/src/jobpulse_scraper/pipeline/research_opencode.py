"""Run the genuine OpenCode free-model client in a fresh, tool-denied workspace."""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path

from jobpulse_scraper.pipeline.research_progress import event, progress
from jobpulse_scraper.pipeline.research_provider import ProviderFailure, model_id


def decode_events(output: str) -> tuple[dict, dict]:
    text = []
    usage = {}
    finished = False
    try:
        for line in output.splitlines():
            record = json.loads(line)
            part = record.get("part", {})
            if record.get("type") == "error":
                status = record.get("error", {}).get("status")
                raise ProviderFailure(f"http_{status}" if type(status) is int else "opencode_client_error")
            if record.get("type") == "tool_use" or part.get("type") == "tool":
                raise ProviderFailure("unexpected_tool_use")
            if record.get("type") == "text":
                text.append(part["text"])
            elif record.get("type") == "step_finish":
                if finished or part.get("reason") not in {None, "stop"}:
                    raise ProviderFailure("incomplete_response")
                finished = True
                tokens = part.get("tokens", {})
                usage = {
                    name: tokens[key]
                    for name, key in [("prompt_tokens", "input"), ("completion_tokens", "output")]
                    if type(tokens.get(key)) is int
                }
        content = "".join(text).strip()
        lines = content.splitlines()
        # A single fenced JSON block is presentation, not a repair of model claims.
        if len(lines) >= 3 and lines[0] in {"```json", "```"} and lines[-1] == "```":
            content = "\n".join(lines[1:-1])
        raw = json.loads(content)
        if not isinstance(raw, dict):
            raise ValueError("Expected JSON object")
        return raw, usage
    except (ValueError, KeyError, TypeError, AttributeError):
        raise ProviderFailure("invalid_json_response") from None


def request(prompt: str, schema: dict, model: str, timeout: int, provider: str = "opencode") -> dict:
    binary = shutil.which("opencode") or shutil.which(str(Path.home() / ".opencode/bin/opencode"))
    if not binary:
        raise ProviderFailure("opencode_client_missing")
    if not 1 <= timeout <= 300:
        raise ValueError("Provider timeout must be 1–300 seconds")
    message = (
        prompt + "\nReturn only JSON matching this schema. No tools or actions are authorized.\n" + json.dumps(schema)
    )
    if len(message.encode()) > 160 * 1024:
        raise ValueError("Research request exceeds 160 KiB")
    config = {
        "permission": "deny",
        "share": "disabled",
        "autoupdate": False,
        "plugin": [],
        "mcp": {},
        "instructions": [],
        "enabled_providers": [provider],
        "default_agent": "research",
        "agent": {
            "research": {
                "mode": "primary",
                "permission": "deny",
                "description": "Return JSON only; no tools or actions",
            }
        },
    }
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="jobpulse-opencode-") as workspace:
        root = Path(workspace)
        settings, cache = root / "config", root / "cache"
        settings.mkdir()
        cache.mkdir()
        env = {k: v for k, v in os.environ.items() if k in {"HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "SHELL"}}
        env.update(
            {
                "XDG_CONFIG_HOME": str(settings),
                "XDG_CACHE_HOME": str(cache),
                "OPENCODE_CONFIG_DIR": str(settings),
                "OPENCODE_CONFIG_CONTENT": json.dumps(config),
                "OPENCODE_DISABLE_DEFAULT_PLUGINS": "true",
                "OPENCODE_DISABLE_CLAUDE_CODE": "true",
                "OPENCODE_DISABLE_AUTOUPDATE": "true",
                "OPENCODE_DISABLE_LSP_DOWNLOAD": "true",
            }
        )
        command = [
            binary,
            "run",
            "--standalone",
            "--format",
            "json",
            "--agent",
            "research",
            "--model",
            provider + "/" + model_id(model),
            message,
        ]
        output_path, errors_path = root / "output.jsonl", root / "errors.txt"
        with output_path.open("w") as output, errors_path.open("w") as errors:
            process = subprocess.Popen(command, cwd=root, env=env, stdout=output, stderr=errors, start_new_session=True)
            try:
                with progress("opencode_client", model=model_id(model)):
                    while process.poll() is None:
                        if time.monotonic() - started >= timeout:
                            raise ProviderFailure("deadline_exceeded")
                        if output_path.stat().st_size > 256 * 1024 or errors_path.stat().st_size > 64 * 1024:
                            raise ProviderFailure("response_budget_exceeded")
                        time.sleep(0.1)
            finally:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
        if output_path.stat().st_size > 256 * 1024 or errors_path.stat().st_size > 64 * 1024:
            raise ProviderFailure("response_budget_exceeded")
        raw, usage = decode_events(output_path.read_text(encoding="utf-8"))
        if process.returncode != 0:
            raise ProviderFailure("opencode_client_error")
    metadata = {
        "provider": provider,
        "transport": "fresh_cli",
        "model": model_id(model),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "usage": usage,
    }
    event("provider_outcome", **metadata)
    return {"data": raw, **metadata}
