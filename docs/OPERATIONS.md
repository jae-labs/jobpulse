# Catalog operations and verification

## Published descriptions

Vacancy descriptions must contain published source text. Listing summaries, login walls,
access denial and generated metadata are not complete bodies. Failed detail fetches retain
existing descriptions and candidate tracking. `make scrape-descriptions` runs the repair
worker in preview mode and writes `.backups/descriptions.csv`. Set `ARGS="--apply"`
only after reviewing it. `make scrape-description-audit` writes its CSV and JSON
summary under `.backups/`; `ARGS` can override report paths. `make scrape-backfill`
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

### Reviewed employer metadata

`make scrape-backfill-employers` is read-only by default. Set `ARGS="--apply --limit 100"`
to link a bounded scan. It uses ID keyset pagination, counts unresolved rows toward the
limit, and guards writes against concurrent company/link changes. It never substitutes
headquarters or increments scoring generations.

Employer linking and metadata enrichment are separate operations. Run
`cd services/scraper && uv run --locked python tools/enrich_employers.py --report /tmp/employers.csv`
to preview all unverified employer records, including those already referenced by jobs.
Use `--apply` to persist the reviewed registry; `--limit N` bounds scanned records.
Updates preserve the existing employer ID and compare its ID, name and metadata source
before writing. A concurrent upgrade or rename is reported as a conflict. Unknown
identities and placeholder employers remain unresolved in the report. No jobs, candidate
data, coordinates from postings, vectors or scoring generations are changed.

`config/employer_evidence.json` records explicit full aliases, first-party evidence URLs
and review dates for additions to the curated registry. Only documented employer addresses
are supplied; conflicting addresses and coordinates without evidence stay null. Employer
coordinates are separate from posting coordinates. Do not assign a hiring platform's
industry to vacancies belonging to its clients. Automatic employer research remains outside ingestion; extending company coverage
requires reviewed identity and field evidence. Vacancy geocoding runs separately
after persistence when the backend key is configured.

To reconcile using the live database only, add `--database-only`. This mode does not
use the external-source registry or fetch any websites. It matches trusted employer
records using punctuation and legal suffix differences, retaining geography and
business-unit names, and rejects conflicting trusted sectors. Optional
`--stored-evidence PATH` accepts reviewed employer self-descriptions from stored jobs:
each JSON record supplies `employer_name`, `sector`, `job_id`, `description_sha256`,
`excerpt` and `reviewed_on`. The job must still belong to that employer, its company
name must match, and its complete body hash and excerpt must remain unchanged.
These records are explicit evidence reviews, not automatic role-keyword classifications.
Keep operational witnesses with the ignored recovery snapshot and retain the outcome report.

Reviewed witnesses can also supply an optional `description`, which must be an exact
substring of the validated business excerpt. Unsupported description claims are rejected.
Explicitly named Community Employment programmes can be individually reviewed as
programme sponsors, with a stored placement witness; this does not classify their
client organisations or introduce an automatic name-based classification rule.
Database-only repairs clear unsupported legacy employer location, coordinates and
website fields before marking that employer metadata verified. They retain only the
reviewed business description, when supplied, rather than promoting legacy guesses.
Vacancy records and coordinates remain untouched. Platform/account labels that contain
postings for multiple hiring companies require separate job identity repairs; never
apply one posting's industry to every vacancy in such an account.

For proven historical headquarters substitutions, `tools/repair_employer_locations.py`
reads only the public catalog section of the approved pre-enrichment snapshot. Supply
`--snapshot PATH --report PATH` to review proposed restorations, then `--apply` to perform
identity/location compare-and-set writes. It refreshes scoring documents/hashes through
`prepare_embeddings`; a retry refreshes already restored matching facts too. No private
snapshot data is imported or used as fixtures.

`make scrape-enrich-ai` optionally uses the operator-installed `agy` CLI to generate
unverified JSON proposals. It has no apply mode, never writes employer/office records,
rejects incomplete or non-exact identities, and leaves unknown sizes empty. Its report
is not a reviewed registry: verify first-party field evidence before adding reviewed
records to `enrich_employers.py --registry`. Automatic title-based programme upgrades
are retired; review each programme placement witness through `--stored-evidence`.

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
after the run, restoring the scheduler's original active state. Current fixtures use
sector keys and normalized sub-scores. Record new measurements as dated evidence; do not treat a local result as a hosted SLO.

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
