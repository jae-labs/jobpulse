# Catalog operations and verification

## Published descriptions

Vacancy descriptions must contain published source text. Listing summaries, login walls,
access denial and generated metadata are not complete bodies. Failed detail fetches retain
existing descriptions and candidate tracking. `make scrape-descriptions` runs the repair
worker; use its dry-run/report options before applying a catalog repair. `make scrape-backfill`
retries missing vectors. Ingestion preserves persisted rows and reports incomplete writes or
pending embeddings as failure; an empty crawl never proves vacancy closure.

Job and profile embeddings use token windows so trailing requirements contribute. Browser
profile preprocessing is versioned in the content hash. Model weights and browser runtime
assets are pinned; after an upgrade verify finite 384-dimensional output under production
CSP and compare reference vectors before keeping the same vector-space version.

## Employer research and offices

Employer metadata is shared catalog data. Sectors need curated or reviewed public evidence;
candidate-private classifications never supply a shared sector. Research stored employers
using `services/scraper/tools/research_employers.py`; inspect `--help` for report and provider
limits. Keep public company evidence in `services/scraper/config/employer_evidence.json`.
Ambiguous names, job-board platforms and feed placeholders must stay unresolved.

`make scrape-enrich-offices` performs bounded office research. Provider credentials stay in
the scraper environment. Apply only reviewed identity/address evidence with source, confidence
and review metadata. A company office is a separate map layer and never establishes a vacancy's
work location. Provider failure must retain already ingested vacancies.

## Vacancy location verification

Posting coordinates and verified vacancy-location evidence may produce vacancy pins.
Employer headquarters must never replace a vacancy location. Geocoding retains unresolved,
remote and ambiguous states, uses bounded provider budgets, and checks the current location
before applying a result. Run `services/scraper/tools/verify_job_locations.py --help` for the
current repair interface. Review reports before applying public location changes.

## Historical local capacity evidence

Repeat the synthetic probe only against a disposable local project:

```bash
make db-benchmark PROJECT=jobpulse-benchmark
```

The script rejects development and hosted Docker targets, creates only synthetic data, and removes its fixtures
after the run. Record new measurements as dated evidence; do not treat a local result as a hosted SLO.

The 1 October 2026 SQL probe used PostgreSQL 17.6, 1,000 synthetic authorized profiles,
1.5 million evaluations and 384-dimensional vectors. Each scenario ran for five seconds.
It excluded HTTP, hosted pooling/network, cold caches, browser rendering and simultaneous
profile edits. It is historical regression evidence, not a hosted SLO certification.

| Catalog | Clients | Scenario | p50 | p95 |
| --- | --- | --- | --- | --- |
| 9,000 | 10 | Jobs | 72.9 ms | 88.2 ms |
| 9,000 | 10 | Search | 78.9 ms | 94.8 ms |
| 9,000 | 10 | Filter | 45.5 ms | 57.1 ms |
| 9,000 | 10 | Overview | 30.7 ms | 39.3 ms |
| 30,000 | 50 | Jobs | 511.3 ms | 970.7 ms |
| 30,000 | 50 | Search | 499.0 ms | 630.6 ms |
| 30,000 | 50 | Filter | 348.5 ms | 496.0 ms |
| 30,000 | 50 | Overview | 265.0 ms | 358.5 ms |

A scheduler tick processed 5,000 scores in 0.90 seconds at 9k and 1.51 seconds at 30k.
The scheduler bounds slices and elapsed time, preserves an exact shortlist up to 1,500,
and isolates tenant failures. Measure queue age and read latency together before scaling
worker concurrency. See [Release and recovery](RELEASE_AND_RECOVERY.md) for current hosted
load, alert-delivery, retention and backup-restore evidence requirements.
