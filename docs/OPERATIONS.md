# Catalog operations and verification

## Board catalog

Generic crawls use enabled `pending`/`active` rows in `public.boards`. Changes reload
on the next sync. Disable a board in the database to pause it; an available empty
catalog does not fall back to YAML. Cooldowns apply per board, not per company.
Core feeds remain in `scrapers/registry.py` and run independently of board health.

Run these Make targets from the repository root. They preview by default; pass
`ARGS="--apply"` only after reviewing the proposed catalog changes. Use
`ARGS="--help"` for the underlying tool's flags.

| Command | Purpose |
| --- | --- |
| `make scrape-import-boards` | Import `config/websites.yaml` and optional `config/board_seeds.yaml`; update matching live boards |
| `make scrape-harvest ARGS="--seeds PATH"` | Probe candidate ATS URLs from a supplied seed file for active Irish roles |
| `make scrape-harvest-ats ARGS="--limit 100"` | Discover ATS boards from employer websites or `--companies PATH` seeds |
| `make scrape-discover-boards ARGS="--source commoncrawl --limit 50"` | Discover board identities; also supports `--source jobs` and `--source freehire` |
| `make scrape-backfill-board-employers` | Link exact employer identities; `--create` permits creating missing employers |

`make scrape-list-boards` lists current targets, including disabled live boards,
without writing metadata. `app.py --list-websites` still lists the YAML seed.
All new wrappers delegate to existing tools; there is no second discovery pipeline.

These commands use service-role credentials and shared public company facts,
never candidate records. `FREEHIRE_API_URL` only configures the optional discovery
source; the scrape pipeline does not call it. See
[scraper architecture](SCRAPER_ARCHITECTURE.md#board-catalog) for outcome and cooldown rules.

## Scraping and matching workflow

### Request pacing and bounded observations

`services/scraper/config/request_policy.yaml`, beside the source seed, stores
host-wide operator pacing and the latest bounded audit. It also applies to hosts
used by database-backed boards and API endpoints. Default pacing is one request
start every three seconds per host; a denial pauses that host for at least fifteen
minutes. [`Retry-After` delta-seconds and HTTP dates](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)
extend that pause. Cooldowns
persist in `.backups/http-cooldowns.json`, so restarting does not clear a block.
Run one crawler/audit process at a time: pacing and state writes are not coordinated
across processes or machines. Do not delete cooldown state to bypass a denial.

```bash
make scrape-request-audit
make scrape-request-audit ARGS="--name JobsIreland.ie --run --apply"
make scrape-request-audit ARGS="--limit 5 --samples 3 --interval 5 --run --apply"
```

The default command only lists enabled YAML seed targets, deduplicated by host.
`--run` checks robots.txt then makes at most five career-page GETs per host, at
least five seconds apart, on at most ten hosts. Robots exclusions stop the probe;
crawl-delay/request-rate directives can only slow it. Required delays over sixty
seconds stop the probe. It uses verified TLS, no retries, no redirect following,
bounded response bodies, and stops at errors, denials or detected challenges.
Redirected/failed robots checks require review; no career requests are sent.
Reports go to `.backups/request-limits.json`; `--apply` records observations and
slower pacing in the policy file without rewriting source identities.

`blocking_threshold: null` is deliberate. Accepted samples are evidence of those
requests at that timestamp, endpoint and audit user agent, not a safe rate ceiling.
The audit does not test ATS API routes hidden behind career pages, all live catalog
rows, or authenticated quotas. Inspect published provider limits before setting a
host policy; a sample never authorizes increasing the request rate.

Shared HTTP helpers pace initial requests, TLS retries and transient server retries.
401/403/429 and server `Retry-After` responses stop immediately, preserve a cooldown
and prevent browser fallback. The `fetch_via_browser` navigation helper respects
those cooldowns; specialized adapters using `with_browser` directly, browser
subresources and automatic HTTP redirects are not individually paced. A challenge
found by the audit also pauses its host. Existing board-health cooldowns remain
separate from transport cooldowns, and failed crawls never imply vacancy closure.

1. Import or discover boards in preview mode, review identities, then apply the
   chosen changes. Link board employers separately if needed.
2. Run `make scrape-boards ARGS="--limit 50"` for a bounded board-only crawl,
   `make scrape-core` for specialized feeds, or `make scrape` for both. `--limit`
   bounds board targets, not postings or core feeds. Nonpositive limits are rejected.
3. Ingestion validates and saves vacancy facts, links employers, retrieves missing
   descriptions and prepares job vectors. A full or board-only run also deduplicates
   through the candidate-safe RPC and refreshes shared overview facets.
4. Job-vector writes advance catalog generation. The PostgreSQL worker updates
   candidate matching asynchronously; do not add a scraper scoring loop or browser
   enqueue after ingestion. `make scrape-backfill` repairs missing/changed job vectors
   without crawling; it does not generate profile vectors.
5. When `GEOAPIFY_API_KEY` is configured, sync also runs bounded office research
   (25 employers) and posting-location verification (100 jobs). Provider failures
   retain ingested vacancies. Standalone helpers below preview before applying.

| Command | Separate enrichment operation |
| --- | --- |
| `make scrape-research-employers` | Public company research proposals; no apply mode |
| `make scrape-enrich-employers` | Preview up to 100 reviewed employer sectors/metadata; `ARGS="--apply --limit 50"` persists a bounded scan |
| `make scrape-backfill-employers` | Link stored jobs to exact employer identities |
| `make scrape-enrich-offices` | Company office directory; separate from vacancy workplaces |
| `make scrape-verify-locations` | Verify posting locations and precision |
| `make scrape-enrich-ai` | Optional operator-installed CLI proposals; no database writes |

Report helpers default to `.backups/`, which stays out of Git. `ARGS` can override
limits, source filters and report destinations. `make scrape-descriptions` and
`make scrape-description-audit` handle body repair/coverage independently of discovery.

## Published descriptions

JobsIreland ingestion first saves listing pages without visiting detail URLs, then
fetches missing descriptions sequentially. `JOBSIRELAND_REQUEST_DELAY_SECONDS`
sets the delay between listing pages and before each detail request (default 3 seconds,
minimum 1). The detail phase stops at the first failed or unusable response, retains
all discovered listings and completed descriptions, and reports the run incomplete.
Rerunning `make scrape` rediscovers listings and skips stored usable bodies, retrying
missing descriptions. A listing failure retains saved pages and reports incomplete
without starting details. This reduces request pressure; it cannot guarantee source access.

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
using `make scrape-research-employers ARGS="--help"` for report and provider
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
Database-only repairs clear unsupported employer location, coordinates and
website fields before marking that employer metadata verified. They retain only the
reviewed business description, when supplied, rather than promoting unsupported values.
Vacancy records and coordinates remain untouched. Platform/account labels that contain
postings for multiple hiring companies require separate job identity repairs; never
apply one posting's industry to every vacancy in such an account.

To repair a vacancy location substituted with an employer headquarters,
`tools/repair_employer_locations.py` reads only the public catalog section of a recovery snapshot. Supply
`--snapshot PATH --report PATH` to review proposed restorations, then `--apply` to perform
identity/location compare-and-set writes. It refreshes scoring documents/hashes through
`prepare_embeddings`; a retry refreshes already restored matching facts too. No private
snapshot data is imported or used as fixtures.

`make scrape-enrich-ai` optionally uses the operator-installed `agy` CLI to generate
unverified JSON proposals. It has no apply mode, never writes employer/office records,
rejects incomplete or non-exact identities, and leaves unknown sizes empty. Its report
is not a reviewed registry: verify first-party field evidence before adding reviewed
records to `enrich_employers.py --registry`. Programme classification requires reviewing each placement witness through `--stored-evidence`.

## Vacancy location verification

Posting coordinates and verified vacancy-location evidence may produce vacancy pins.
Employer headquarters must never replace a vacancy location. Geocoding retains unresolved,
remote and ambiguous states, uses bounded provider budgets, and checks the current location
before applying a result. Run `services/scraper/tools/verify_job_locations.py --help` for the
current repair interface. Review reports before applying public location changes.

## Capacity verification

Run synthetic probes only against a disposable local project:

```bash
make db-benchmark PROJECT=jobpulse-benchmark
```

`scripts/benchmark-database.mjs` rejects development and hosted Docker targets, creates
synthetic fixtures, removes them after execution, and restores the scheduler's active state.
Fixtures exercise normalized sectors, scoring factors and vectors. Inspect jobs, search,
filter and overview latency alongside worker throughput and queue age.

Local SQL probes exclude HTTP, hosted pooling/network, public-network model downloads,
browser rendering and target-device GPU behavior. Validate hosted reads alongside catalog
refresh and concurrent profile edits before setting capacity or freshness expectations.
Measure cold and warm paths separately, including failures and retries. Increase worker
concurrency only while catalog reads retain their latency budget and tenant work remains bounded.
See [Release and recovery](RELEASE_AND_RECOVERY.md) for hosted load, alert delivery,
retention and backup-restore checks.
