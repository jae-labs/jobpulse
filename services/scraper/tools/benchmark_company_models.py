"""Compare a free OpenCode model and the configured Gemini baseline on synthetic evidence."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from pydantic import ValidationError

from jobpulse_scraper.company_index.benchmark import identity_cases, score
from jobpulse_scraper.company_index.review import PROMPT_VERSION, AgyReviewer
from jobpulse_scraper.paths import REPO_ROOT
from jobpulse_scraper.pipeline.research_progress import event, progress
from jobpulse_scraper.pipeline.research_provider import FREE_MODEL, FREE_MODELS, PAID_MODELS, validate_policy


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT / ".backups/company-index/model-benchmark")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--opencode-provider", choices=["opencode", "opencode-go"], default="opencode-go")
    parser.add_argument("--only", choices=["all", "opencode", "agy"], default="all")
    parser.add_argument(
        "--models", nargs="+", choices=sorted(FREE_MODELS | PAID_MODELS), help="OpenCode models to compare"
    )
    parser.add_argument("--allow-paid", action="store_true", help="Explicitly permit paid-model benchmarks")
    args = parser.parse_args()
    models = args.models or [FREE_MODEL]
    if len(models) != len(set(models)):
        parser.error("Model selection must be unique")
    try:
        for model in models:
            validate_policy(model, None, args.allow_paid)
    except ValueError as exc:
        parser.error(str(exc))
    if not 1 <= args.timeout <= 300 or not 1 <= args.batch_size <= 20:
        parser.error("timeout must be 1–300 and batch-size 1–20")
    args.root.mkdir(parents=True, exist_ok=True)
    cases = identity_cases()
    report: dict = {
        "scope": "synthetic identity evidence; not a real-world office accuracy benchmark",
        "cases": len(cases),
        "prompt_version": PROMPT_VERSION,
        "batch_size": args.batch_size,
        "providers": {},
    }
    failed = False
    for provider, model in [*[(args.opencode_provider, m) for m in models], ("agy", "gemini-3.8-flash-low")]:
        if args.only != "all" and ((args.only == "agy") != (provider == "agy")):
            continue
        # Fresh caches keep measured provider latency separate from reuse.
        reviewer = AgyReviewer(
            args.root / f"{provider}-{time.time_ns()}",
            provider=provider,
            model=model,
            timeout=args.timeout,
            allow_paid=args.allow_paid if provider != "agy" else False,
        )
        measured = []
        provider_report: dict = {"model": model, "completed": False, "batches": [], "automatic_writes": 0}
        report["providers"][f"{provider}:{model}" if len(models) > 1 else provider] = provider_report
        started = time.monotonic()
        for offset in range(0, len(cases), args.batch_size):
            batch = cases[offset : offset + args.batch_size]
            try:
                with progress("model_benchmark", provider=provider, model=model, batch=offset // args.batch_size + 1):
                    results = reviewer.compare([c["pair"] for c in batch])
                measured.extend(results)
                provider_report["batches"].append({"score": score(results, batch), "results": results})
            except Exception as exc:
                provider_report["failure_category"] = getattr(exc, "category", type(exc).__name__)
                if isinstance(exc, ValidationError):
                    provider_report["validation_issues"] = [
                        {"location": e["loc"], "type": e["type"]} for e in exc.errors()
                    ]
                failed = True
                break
            finally:
                provider_report.update(
                    score=score(measured, cases),
                    provider_calls=reviewer.calls,
                    elapsed_seconds=round(time.monotonic() - started, 3),
                    provider_runs=reviewer.provider_runs,
                )
                temporary = args.root / "report.partial"
                temporary.write_text(json.dumps(report, indent=2))
                temporary.replace(args.root / "report.json")
            event("benchmark_progress", provider=provider, model=model, **provider_report["score"])
        provider_report["completed"] = len(measured) == len(cases)
        (args.root / "report.json").write_text(json.dumps(report, indent=2))
        event(
            "benchmark_provider_finished",
            provider=provider,
            **{k: v for k, v in provider_report.items() if k not in {"batches", "provider_runs"}},
        )
    event("benchmark_finished", report=str(args.root / "report.json"))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
