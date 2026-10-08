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

`services/scraper/src/jobpulse_scraper/config/request_policy.yaml`, beside the source seed, stores
host-wide operator pacing and the latest bounded audit. It also applies to hosts
used by database-backed boards and API endpoints. Default pacing is one request
start every three seconds per host; a denial pauses that host for at least fifteen
minutes. [`Retry-After` delta-seconds and HTTP dates](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)
extend that pause. Cooldowns
persist in `.backups/http-cooldowns.sqlite3`; `.backups/http-cooldowns.json` is the
compatible diagnostic export. Worker processes share reservations and denials on
one machine. Separate machines need coordinated host pacing. Do not remove either
state file to bypass a denial. `make scrape-history` reports source/host observations;
the ledger retains at most 10,000 events and thirty days of responses.

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
those cooldowns. Specialized browser sessions, document/script/XHR requests and
HTTP redirects also use host reservations; images, fonts and media are blocked. A challenge
found by the audit also pauses its host. Existing board-health cooldowns remain
separate from transport cooldowns, and failed crawls never imply vacancy closure.

Local cooldown rejections use `source_cooldown` with `request_sent: false`; only an actual remote response contributes an HTTP status and denial observation.

### Durable crawl workers

```bash
make scrape ARGS="--limit 100"
make scrape-enqueue ARGS="--employer Tines"
make scrape-worker ARGS="--limit 20"
make scrape-history
cd services/scraper
uv run --locked jobpulse-scraper --replay <snapshot-metadata-key>
```

`make scrape` uses automatic durable startup: a service-only RPC serializes
concurrent starters and queues sources independently when they are eligible.
Large catalogs enqueue in bounded batches of at most 1,000 sources; this batch
size is independent of the worker task budget. Rerun startup after a batch failure
to enqueue remaining sources while preserving existing work.
Pending/running sources keep their progress and retry dates. Future retries never
block new or refresh-eligible peers. Completed sources refresh after at least six
hours from `last_succeeded_at`. Failed source crawls wait at least six hours before
retrying; longer remote delays remain authoritative. Detail/vector tasks retain
their separate backoff. Exhausted (`dead`) tasks require explicit enqueueing.
`make scrape` defaults to 10,000 due tasks, the supported maximum, and stops early
when no work is due. `--limit` sets a smaller task budget.
Automatic drains use four task slots; `--concurrency 1` selects a single slot and
`--concurrency 4` is the maximum. The budget is shared across slots. Tasks have a
120-second hard deadline; `--task-timeout 180` changes it, up to 3,600 seconds.
Timed-out tasks record `task_deadline_exceeded`, retain committed partial facts
and wait for their normal retry date. Interrupts stop active child processes.
The shared local host ledger coordinates pacing across slots and worker processes.
Apply the forward claim migrations to the selected database before relying on
source/detail/vector fairness. Source publication and hosted migration application
remain separate operations.
Explicit `make scrape-worker` defaults to 20 tasks and one slot. Use it to process only existing
work, or `make scrape-enqueue` to deliberately request a source refresh, bypassing
the successful freshness interval while retaining failed retry dates and transport
cooldowns.
`make scrape ARGS="--sync"` selects the synchronous pipeline.
Durable workers emit flushed, timestamped `crawl_event` JSON lines on stderr.
Task events identify the public source, kind and attempt; stage events show
fetching, persistence and vector work. `task_active` reports elapsed time during
long operations during lease renewal, normally every thirty seconds.
`task_finished` follows fenced completion and reports outcome counts; failed
source tasks include a minimum retry delay, while the database run history owns
the scheduled retry date. Final aggregate JSON stays on stdout.
Every Make scraper command uses `scripts/run-scraper.mjs` to save both streams
to an owner-readable, unique log in the Git-ignored repository `logs/` directory.
The terminal prints `[LOG]` with the absolute file path. Logs retain live output,
completion status and interruptions without changing stdout/stderr routing or exit
codes. Tail the printed path with `tail -f` to monitor a run from another terminal.
Log files require local cleanup and have independent retention from database
history and replay snapshots. Commands started before the wrapper is loaded keep
their existing output behavior; direct Python commands do not use this wrapper.

Enqueue selects enabled live boards, preserving the authoritative empty/disabled
catalog behavior. Workers claim at most the requested task count and renew leases;
source, detail and vector tasks share the durable queue. A failed task receives a
retry date and bounded attempts. Re-enqueue deliberately requests another source
crawl; it does not clear transport cooldowns. Independent processes can drain the
same queue safely. Replay reads the configured state directory without database writes.

Protected operator API routes include `POST /api/crawl/enqueue`,
`GET /api/crawl/runs` and `GET /api/crawl/requests`. They use the same loopback/token
and origin checks as synchronization. Run history returns at most 100 rows.
Workers require service credentials; browser roles cannot call queue/snapshot/vector
RPCs. Keep source implementation, local schema application and hosted deployment
as separate operations. The [architecture guide](SCRAPER_ARCHITECTURE.md#durable-work-provenance-and-replay)
defines fencing, provenance and snapshot bounds.

Use `make scrape-report` for the latest 100 finished runs or
`make scrape-report ARGS='--employer "Company"'` for one company. The report is
read-only and its JSON stdout is also saved by the normal log wrapper. Per-source
results include average duration, measured/unmeasured run counts, sent requests,
weighted requests per second, denials, ingestion-input body coverage and the two
latest measured runs. Host details retain requests sent before a denial,
preceding-minute host traffic, retry delay and the learned pacing interval.
Request-level JSON diagnostics show transport and resource type without URLs,
payloads or lease credentials. Local cooldown skips do not count as sent requests.
Generic acquisition failures retain sanitized HTTP, timeout, DNS and cooldown
categories. Reaching the shared task limit emits `task_budget_exhausted`;
`no_due_tasks` indicates an empty due-work claim rather than a completed campaign.

`make scrape` and `make scrape-worker` automatically save a unique owner-readable
`logs/crawl-report-*.json` after each drain, including drains with failed tasks.
The terminal prints its path and a compact report summary. The report covers the
latest 100 finished runs, not an unlimited campaign history. A report failure
emits `report_failed` and fails the command; already finished tasks remain saved.

Start a review campaign with `make scrape ARGS="--limit 10 --concurrency 2"`.
After reviewing outcomes with no new denials or worsening failures, increase to
bounded batches of at most 50 tasks and four concurrent slots. Review the printed
log and report before increasing either bound. Capture the configured source set and initial
queue state in an ignored campaign manifest, track attempts and outstanding
source/detail/vector work, and retain batch reports. Attempt coverage is separate
from successful extraction: failures, deferred retries and unverified empty pages
remain unresolved. A complete campaign verifies supported listing pagination and
available detail data for the selected sources, records unpublished fields as
unknown, and reviews remaining source limitations explicitly. Respect future retry dates.
When a source route changes, verify its replacement on the employer's first-party
careers page. Challenges and captchas remain blocked outcomes; do not bypass them.
Use the maintained [agent process](../AGENTS.md#scraper-measurement-and-improvement-process)
for evidence-driven changes and remeasurement between batches.

At each checkpoint, record batch outcomes by status, sent requests and observed
rate, denials/cooldowns, and extraction inputs. Label opportunity and write sums
as source observations because the same job can appear at multiple employers.
Classify blocked, unsupported, failed and verified-empty boards separately;
only bounded source evidence justifies route or parser changes. Do not override
retry dates to accelerate a campaign.

Generic sources reuse a successful browser preference for up to seven days,
probe HTTP again after expiry or three failures, and fall back once when the
preferred transport fails. Known adapters stay authoritative. Durable run history
keeps positive source evidence available when local state is absent.

Generic sources also retain verified query-free HTTP(S) destinations in the local
ledger for seven days. Successful extraction or an explicit empty signal establishes
the route; failed use removes it. Configured source identities and ATS adapters remain
authoritative. Query-bearing destinations are rediscovered to avoid retaining session
parameters. Route evidence is local to the scraper machine.

JobsIreland uses three-second host spacing supported by a bounded public-detail
pilot, with automatic 429 backoff and remote cooldowns preserved. This observation
does not establish a quota. Six-hour positive detail caching avoids repeated public
body requests; stale detail tasks also reuse usable catalog bodies. Listing responses
provide metadata and still need separate detail acquisition when bodies are absent.
iCIMS sources use the direct server-rendered listing adapter, including current
location labels and bounded published-link pagination. Synthetic multi-country
and continuation tests verify that faster acquisition retains Irish coverage.
Stage totals in reports separate host pacing, HTTP acquisition, catalog operations,
detail extraction and vectors. These inclusive worker durations overlap; compare
elapsed run time separately and never sum nested stages into a wall-time estimate.

The full-cycle performance target is two hours for eligible listing acquisition,
available detail hydration and vector work. Measure source coverage, detail coverage,
queue growth and completed tasks alongside elapsed time. A drain that reaches its
10,000-task budget or finds only future retries is not complete source coverage.
Four slots improve overlap across hosts; host pacing and cooldowns still apply.
Keep the 120-second hard deadline for paginated sources: shortening it without
continuation evidence can lose completeness. Diagnose repeated deadlines using
request counts, page continuations and bounded snapshot replay before changing budgets.

Failure remediation follows the error classification:

| Outcome | Required next action and acceptance evidence |
| --- | --- |
| Invalid payload | Verify provider/tenant route and schema; add synthetic malformed and pagination fixtures; retain failure until valid published data is parsed. |
| Unsupported or generic failure | Verify the first-party careers/ATS link, install a focused parser or configured adapter, and compare published counts and fields. |
| HTTP failure / DNS | Separate removed routes from transient outages; repair verified targets, retain backoff, and never turn an error page into an empty board. |
| Denial / challenge / auth wall | Stop acquisition, preserve remote cooldown and host measurements, and use an authorized public feed only when available. |
| Deadline / response budget | Inspect slow pages and oversized feeds; use supported filters and resumable pagination instead of raising limits blindly. |
| Missing detail body | Replay the correct vacancy page, preserve concise verified text, and keep vector quality thresholds independent. |

Each unsuccessful source needs a private action record keyed by configured source
identity, including error, evidence, proposed route/parser change, executable test and
validation status. Reports and observations remain in ignored logs or recovery files;
maintained guides describe the current contracts. Compare a representative bounded
sample after each change before estimating a full-cycle duration.

For optimization, capture a source report, change one adapter or host setting,
run a bounded sample, then compare duration, request mix, failure rate and field
coverage. Compare similar source/detail workloads; a faster failed or empty run
does not establish improved extraction. Validate counts and identities against
synthetic pagination fixtures and selected published listings. Review detail body
coverage with `make scrape-description-audit`. Rate-limit observations do not
establish a guaranteed request allowance; automatic learning increases backoff
on repeated 429 responses and respects longer remote cooldowns.

Schedule bounded worker invocations with the deployment's existing scheduler, with SQL history maintenance performed at the start of each drain. The
CLI does not create a hosted schedule or deploy workers. Inspect incomplete/dead
work and source cooldowns before retrying; increasing concurrency does not establish
provider permission or a higher safe request rate. Request history includes the latest
denial status, response ordinal within retained source history, preceding-minute host
response count, Retry-After, learned interval and cooldown. These are observations,
not a published or guaranteed quota. Browser callback observations retain the
source identity, and cookie-based ATS sessions share the public request gate.

1. Import or discover boards in preview mode, review identities, then apply the
   chosen changes. Link board employers separately if needed.
2. Run `make scrape-boards ARGS="--limit 50"` for a bounded board-only crawl,
   `make scrape-core` for specialized feeds, or `make scrape` for automatic durable
   execution. In synchronous mode, `--limit` bounds board targets, not postings or
   core feeds; in durable worker mode it bounds tasks. Nonpositive limits are rejected.
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
limits. Keep public company evidence in `services/scraper/src/jobpulse_scraper/config/employer_evidence.json`.
Ambiguous names, job-board platforms and feed placeholders must stay unresolved.

`make scrape-enrich-offices` performs bounded office research. Provider credentials stay in
the scraper environment. `ARGS="--apply --limit 10000"` processes up to 10,000 distinct
eligible company/location pairs, using database pages of at most 100. The default is 25;
preview mode advances through the same distinct pairs without writing outcomes. The command
uses four lookup slots by default (`--concurrency 1` through `8`). Request starts share
one-second pacing and provider cooldowns across local processes; cache locks coalesce
identical requests. Lookup completions, 15-second heartbeats and credential-free request
timings go to the automatic log. Five provider failures stop new scheduling; in-flight
outcomes finish and are saved. Successful saved lookups
retain their existing refresh intervals. Provider request budgets and identity checks remain active.
The report includes request counts, cache hits, accumulated request time and rate-limit counts.
Concurrency overlaps provider latency; it does not establish a higher permitted request rate.
Apply only reviewed identity/address evidence with source, confidence
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

## Local Irish company index

`make scrape-company-index` downloads public CRO and regional Overture Places
snapshots and builds `.backups/company-index/companies.sqlite3`. The raw ZIP,
regional JSONL, SQLite index, lock and pilot report are Git-ignored. Imports use a
process lock and replace each source in one SQLite transaction; interruption or
invalid/empty imports retain the previous indexed snapshot. Downloads publish
atomically, enforce size bounds, verify CRO ZIP checksums and log progress.
Overture uses four DuckDB threads, a 1 GiB memory limit and a fifteen-minute query
budget. The optional locked `company-index` dependency group provides DuckDB.

```bash
make scrape-company-index
make scrape-company-pilot
# Refresh one source, or rebuild from the downloaded files without network:
make scrape-company-index ARGS="--source cro"
make scrape-company-index ARGS="--source overture --release 2026-09-23.1"
make scrape-company-index ARGS="--local"
# Supply public employer JSON instead of reading the configured catalog:
make scrape-company-pilot ARGS="--employers /tmp/public-employers.json --limit 200"
```

The pilot reads public employer IDs, names and websites in bounded pages; it does
not read candidates or write Supabase. Its default sample is the first 200 employers
by ID, not a statistically representative accuracy sample. `pilot.json` contains
snapshot checksums, attribution, import timestamps, candidate evidence, matching
reasons, conflicts, coverage counts and elapsed time. Exact domain/company-number
support establishes an identity candidate, not a verified office. Name-only
matches, conflicting domains, closed places and duplicate legal records require
review. The match response retains at most 100 candidates and flags truncation.

CRO supplies legal identities and **registered addresses**, which may belong to
agents. Conflicting records for a company number remain separate variants.
Overture supplies **operating-place candidates**, with source evidence, confidence,
websites, categories, taxonomy and coordinates. The geographic extract includes the island bounding box;
explicit non-IE address records are excluded, while unknown country records remain
unverified candidates. This preserves missing-address coverage without asserting
that every point lies in the Republic. Snapshot freshness and field evidence must
be reviewed before any production use; no automatic office or vacancy updates are
connected to this index. `make scrape-enrich-offices` keeps its existing provider
workflow. Review correct identities, actual operating-office evidence, duplicate
places and missing addresses before integrating a lookup shortcut.

CRO attribution: Contains Irish Public Sector Data licensed under a Creative Commons
Attribution 4.0 International (CC BY 4.0) licence; Companies Registration Office.
Overture records retain upstream sources; redistribution must follow
[Overture attribution and licensing](https://docs.overturemaps.org/attribution/).
Source formats follow the [CRO dataset](https://opendata.cro.ie/dataset/companies)
and [Overture DuckDB extraction guide](https://docs.overturemaps.org/getting-data/duckdb/).
The local index keeps only the latest successful import per source; refreshes are
operator-triggered. Local raw files contain public company data and are not a
Supabase recovery backup.

Acceptance contracts: both imports complete with provenance; source refresh failure
preserves the previous index; legal addresses remain separate from operating places;
ambiguous identity evidence remains review-only; the bounded 200-employer pilot
reports coverage and runtime with zero catalog writes. Synthetic tests enforce the
matching and recovery contracts in `services/scraper/tests/test_company_index.py`.

### Close company-name matches

`make scrape-company-pilot ARGS="--fuzzy"` checks otherwise unmatched employer names
and writes `.backups/company-index/pilot-fuzzy.json`, preserving the exact-only
`pilot.json`. `--similarity-threshold 85` selects the default 0–100 score cutoff.
The score measures spelling/token-order similarity; it is not a calibrated
identity probability. Short normalized names below six characters and names over
128 characters receive no fuzzy search. Exact name/domain/number evidence takes
precedence and is not displaced by fuzzy candidates.

The first fuzzy pilot builds a local SQLite FTS5 trigram index atomically. Snapshot
insert/delete/update triggers maintain it in the same transaction as the records;
failed refreshes preserve both records and search evidence. Subsequent pilots reuse
it without another snapshot download. Up to 24 three-character query terms retrieve
at most 1,000 candidates; Python compares symmetric character sequences and sorted
token sequences, retains scores at the configured cutoff and reports the best ten.
Search/result truncation remains explicit. Common names, abbreviations and heavily
changed spellings can be missed by these bounds; an empty fuzzy search does not
prove absence from the datasets. See [SQLite FTS5](https://www.sqlite.org/fts5.html)
for tokenizer and external-content indexing requirements.

Fuzzy candidates carry `similar_name`, the score, extra/missing name tokens,
source evidence, domain conflicts, closed state and mandatory review. The
`spelling_only` flag identifies suggestions without shared non-generic name tokens;
shared generic terms such as Ireland, Group or Services do not establish identity. Geographic
and business-unit words remain in the comparison. Fuzzy matches never establish
`identity_supported`, merge employers, write offices or change vacancy locations.
Reports separate fuzzy-only employer coverage and truncated searches. Review
actual identities and first-party operating-office evidence before accepting a
proposal. Synthetic typo, token-order, country/domain conflict, acronym, refresh
rollback and result-bound tests live in `services/scraper/tests/test_company_index.py`.
