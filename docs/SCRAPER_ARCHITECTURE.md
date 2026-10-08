# Scraper Architecture & Ingestion Pipeline

`services/scraper/` is a vacancy data provider. It does not read profiles, evaluate candidates, or write `user_job_evaluations`.

## Package and boundaries

The installable `jobpulse_scraper` package lives in `services/scraper/src/jobpulse_scraper/`.
`jobpulse-scraper` and `python -m jobpulse_scraper.app` expose the CLI; the service-root
`app.py` keeps existing Makefile and script invocations working. Packaged YAML/JSON
resources load relative to the package. `JOBPULSE_SCRAPER_HOME` selects an explicit
service home and `JOBPULSE_CRAWL_STATE` selects writable crawl state. The editable
checkout defaults to `.backups/crawler/`; an installed wheel defaults to its working
directory's `.backups/crawler/`.

Paths in the module table are relative to the package root:

| Boundary | Modules | Contract |
| --- | --- | --- |
| Published facts | `contracts.py` | Immutable targets/responses, typed transport protocol, raw vacancy models and explicit result counts |
| Parsing | `scrapers/parsers/` | Supplied-response functions import neither acquisition nor persistence; ATS JSON, HTML, XML and embedded feed parsers remain replayable |
| Acquisition | `scrapers/adapters.py`, `scrapers/requests.py`, `scrapers/providers/` | Typed GET/POST requests and injected request openers control bounded pagination and permitted endpoint recovery |
| Compatibility workflows | `scrapers/core/`, `scrapers/generic/` | Supported synchronous commands compose acquisition, normalization and ingestion |
| Public transport | `network/transport.py`, `network/http_client.py`, `network/browser.py` | Injected HTTP/browser transports share pacing, denial handling and response bounds |
| Catalog normalization | `engine/normalization.py` | Pure identities preserve canonical requisition URLs and PostgreSQL dedupe keys |
| Detail extraction | `pipeline/detail_enrichment.py`, `extractors/` | Published detail hydration preserves listing facts and existing bodies on failure |
| Persistence | `database/ingestion.py`, `database/repository.py` | Catalog writes and maintenance contain no candidate evaluation loop |
| Durable execution | `runtime/queue.py`, `runtime/lease.py` | Database leases fence source writes, vectors and completion; detail/vector tasks retry independently |
| Replay | `snapshots.py`, `network/recording.py` | Bounded public responses use content checksums and an injected metadata sink |

Composition keeps parsers reusable by fixtures, snapshot replay and alternate
execution engines. Stateful classes own transport, queue or storage lifecycles;
pure transformations remain functions. Provider compatibility functions accept a typed
`RequestOpener`; the primary adapter contract accepts an injected `Transport`. These boundaries follow the dependency
inversion and small-abstraction principles in
[Architecture Patterns with Python](https://www.cosmicpython.com/book/chapter_02_repository)
and its [coupling chapter](https://www.cosmicpython.com/book/chapter_03_abstractions).

## Data Flow

```mermaid
flowchart LR
    Sources[Employer and ATS sources] --> Tasks[Durable source tasks]
    Tasks --> Transport[Public transport and snapshots]
    Transport --> Parsers[Supplied-response parsers]
    Parsers --> Clean[Shared normalization]
    Clean --> Jobs[Lease-fenced catalog and provenance transaction]
    Jobs --> Details[Durable published-detail tasks]
    Jobs --> Vectors[Durable job-vector tasks]
    Details --> Jobs
    Vectors --> DB[(Supabase job_scoring_embeddings)]
    DB --> Trigger[PostgreSQL advances catalog generation]
```

`pipeline/runner.py` preserves synchronous CLI/API synchronization. Durable workers
use typed adapters where available and the supported specialized acquisition paths
for other sources. `database/ingestion.py:save_jobs_batch` validates, cleans and saves
shared vacancy facts. Durable writes enqueue detail or vector tasks in the same
transaction; synchronous compatibility calls hydrate and prepare vectors inline.
`database/embeddings.py:prepare_embeddings` computes missing or changed
`all-MiniLM-L6-v2` job vectors. The model uses Apple Metal when available and CPU
otherwise, and reads no profile or candidate data. Core reports carry explicit
counts while preserving two-value Python unpacking; health never parses display text.

The statement trigger on `job_scoring_embeddings` advances one catalog generation. Candidate scoring is decoupled from ingestion and driven by the durable worker. User profile vectors are generated in a browser worker; profile/vector writes enqueue work atomically. `rescore_user` requests a retry or shortlist limit change and does not score synchronously. A completed request keeps at most 1,500 native evaluations. Catalog refreshes score only changed or missing facts. Score composition for weight changes happens in `get_jobs_page` and overview metrics from stored sub-scores.

The scraper hashes scoring job facts separately from the embedding document. A salary or location change updates the job vector row even if the encoded text is unchanged, which invokes the SQL trigger to refresh affected evaluations.

## Network policy

Public HTTP requests verify TLS first and retry certificate errors with verification
disabled. Browser contexts ignore public-source certificate errors. Supabase keeps
its own verified HTTP client. Connection/protocol failures remain source failures.

The request gate reserves host slots in a local SQLite transaction before sleeping.
Independent worker processes share host pacing and durable cooldowns on one machine;
separate machines require their own coordinated deployment policy. Redirects, TLS
fallbacks, transient retries and browser document/script/XHR requests use the gate.
Browser images, fonts and media are blocked. Denials and `Retry-After` stop further
host requests, including fallback transport attempts. Source observations record
accepted responses, denials, timestamps and server retry directions; accepted samples
never establish a safe request ceiling. See [request operations](OPERATIONS.md#request-pacing-and-bounded-observations).

## Durable work, provenance and replay

`crawl_tasks`, `crawl_runs`, `crawl_snapshots` and `job_occurrences` are backend-only
public-source operational tables: RLS is enabled and browser roles receive no grants.
Claims use `FOR UPDATE SKIP LOCKED`, renewable leases and unique fencing tokens.
An expired claim records an expired attempt and permits recovery; stale tokens cannot
write vacancies, snapshots, vectors or completion. Retry dates and bounded attempts
survive process termination. Candidate matching remains in its existing SQL queue.

A catalog write records the source identity, provider ID or canonical posting URL,
content hash and available snapshot link. Deduplication transfers observations and
candidate tracking to the retained job. Metadata-only listings remain catalog rows;
failed source/detail requests do not close or delete vacancies. Vector writes compare
the current scoring facts with the inference snapshot before accepting output.

Snapshots contain public bodies and sanitized public URLs, never authorization headers,
cookies, credentials or candidate records. Local storage enforces a 16 MiB body limit,
a 256 MiB aggregate limit, at most 10,000 files and thirty-day retention under a
process-safe lock. Replay validates metadata/body checksums and invokes the registered
parser without network or database writes. Registered adapter pages receive replayable
snapshots. Durable compatibility workflows retain source provenance
and transport observations; their occurrence snapshot link can be null. SQL history retention removes snapshots
older than thirty days or beyond 10,000 rows, and finished runs older than thirty days
or beyond 100,000 rows; provenance remains when its snapshot expires. Workers invoke `purge_crawl_history()` with service credentials before a bounded drain.
Automatic `make scrape` startup uses the service-only `enqueue_crawls_if_idle`
RPC with per-source eligibility. Concurrent starters serialize through a
transaction-scoped advisory lock. Pending/running source tasks stay untouched;
future retries do not block other eligible sources. Source targets commit together
before workers can claim them. Completed sources wait six hours from
`last_succeeded_at`. Failed source crawls receive a six-hour minimum retry date,
with longer remote delays preserved. Detail/vector tasks keep independent backoff,
and exhausted tasks require explicit enqueueing. Only successful fenced completion
advances the successful timestamp.
Repeated scheduling preserves pending targets, retry attempts and retry dates; it
starts a new attempt cycle only for completed or dead work.

PDF detail extraction accepts at most 10 MiB, 100 pages and 200,000 extracted
characters. Catalog identity URLs retain their original values; public acquisition
encodes invalid wire characters such as spaces. Role-specific booklet links stay on
the official origin and exclude unrelated privacy documents.

## Execution engine decision

The runtime uses composed adapters with PostgreSQL durability. `make scrape-pilot`
compares this executor with Scrapy on synthetic ATS JSON, paginated HTML and real
Chromium rendering. The executable contract requires identical vacancy records and
only one remote request after a denial, under the same host pacing. This workload
does not establish a material Scrapy throughput benefit, so production does not
require Scrapy. Scrapy lives in the evaluation/development dependency group.

Reevaluate the engine when broad HTML frontiers require its spider scheduler,
duplicate filtering or downloader middleware. Keep database leases and candidate
boundaries authoritative if an additional engine is introduced. Scrapy's
[architecture](https://docs.scrapy.org/en/latest/topics/architecture.html) and
[embedded crawler APIs](https://docs.scrapy.org/en/latest/topics/practices.html)
provide the extension points; the parser contract remains independent of them.

## Board catalog

`public.boards` is the source of truth for what the scraper visits: one row per
`(provider, board, region)` crawl target carrying the company, sector, priority,
careers URL, lifecycle status (`pending`/`active`/`rejected`/`retired`) and crawl
health. `config/websites.yaml` is the bootstrap seed and runtime fallback when the
catalog is unavailable. The importer additionally reads an optional
`config/board_seeds.yaml`; runtime fallback does not read that file.
An empty or disabled catalog stays authoritative.
The catalog and lookup indexes reload once per sync, including API-triggered runs.
`tools/import_boards.py --apply` seeds or refreshes the table, and
`tools/harvest_boards.py --apply` inserts newly discovered boards as `pending`. Each
board's `provider`/`board` identity drives crawling — the adapter is tried first, and a
canonical board URL is used when the configured careers URL hides the ATS behind a vanity
domain — and `employer_id` links a board to the employer registry
(`tools/backfill_board_employers.py`). The catalog is service-role-only (RLS enabled, no
browser grants) and carries no candidate data.

New boards are discovered by `tools/discover_boards.py`, which mines token-based ATS
board identities and inserts them as `pending`: `--source commoncrawl` sweeps Common
Crawl's CDX index, `--source jobs` recovers boards from postings already stored, and
`--source freehire` reads a public Ireland job index for board identities only. Every
posting is still crawled from the underlying ATS, so the catalogue stays first-party.

Each crawl records its outcome through `record_board_outcome`: success promotes a proven
`pending` board to `active` and clears failures; failure increments `consecutive_failures`
and cools the board down (no cooldown below 3 failures, then `6h * 2^(f-3)` capped at 24h).
`sync_watchlist_employers` skips boards whose `cooldown_until` is still open, and a health
write never discards a completed crawl. JSON listing adapters distinguish verified empty
results from request, payload and pagination failures. Verified boards with no Irish roles
use a weekly cooldown. A board that resolves to no existing employer can
create one through the shared employer lookup service (`tools/backfill_board_employers.py
--create`), so discovered companies join the registry instead of staying unlinked.

`get_overview_metrics` reads shared facets (total, locations, canonical sectors) from the
one-row `catalog_stats` rollup refreshed by `refresh_catalog_stats()` at the end of each
scrape. Per-user
metrics are derived from the caller's evaluations and statuses for open postings.
Statement triggers on jobs and employers invalidate the rollup in the write transaction,
including updates that preserve the job count. An invalid rollup falls back to a live
computation; refresh serializes with invalidation before marking the facets valid.

Automatic archival is disabled. Neither a board health timestamp nor a source sync
timestamp proves that a particular vacancy closed: failed, empty and partial crawls
must preserve existing postings. `close_stale_jobs` is a bounded service-only no-op
for compatibility until vacancy-specific closure evidence is implemented. Explicitly
closed postings retain candidate history but are excluded from live overview metrics.

## CLI and API

`scrapers/registry.py` owns specialized feeds, including JobsIreland, 4dayweek.io,
JobStash and Google alongside council, university and employer scrapers. Aggregator
records supply each posting's employer; nested company objects are reduced to their
name before persistence. Paginated Google, JobStash, 4dayweek and JobsIreland requests
retain existing vacancies on listing failures or pagination limits and report incomplete
ingestion, including any rows already persisted.

- `make scrape` crawls all configured employers and saves jobs and embeddings.
- `make scrape-boards ARGS="--limit 50"` crawls only a bounded set of live boards.
- `make scrape-list-boards` inspects catalog targets without writes; `--list-websites`
  remains the YAML-seed inspection command.
- `make scrape-backfill` prepares missing vectors for an existing catalog without crawling.
- `make scrape-test NAME="Employer Name"` limits the crawl to one employer.
- `make scrape-core` runs core sources only.
- `make scrape-validate` checks source configuration.
- The optional local API supports operator/external integrations. The current dashboard reads Supabase directly, not this API. It exposes catalog and sync endpoints, never profiles or candidate evaluations. Preserve its compatibility surface until deployed consumers are inventoried.

Discovery and standalone enrichment wrappers are documented in the
[operating workflow](OPERATIONS.md#scraping-and-matching-workflow). Matching runs
in PostgreSQL after vector writes; there is no separate scraper scoring command.

The API permits token-free requests only from a direct loopback connection
(`127.0.0.1`/`::1` peer, a loopback `Host`, and no forwarding headers) with no
`Origin` header (local CLI tools), or the exact local dashboard origins
`http://localhost:5173` and `http://127.0.0.1:5173`. A request that arrived through
a proxy or tunnel carries forwarding headers, so its loopback peer address does not
grant access. Untrusted browser origins are rejected before catalog reads or sync
execution, including simple POSTs that do not need a CORS preflight.

For an external dashboard, set `JOBPULSE_ALLOWED_ORIGIN` to its exact origin
(scheme, hostname and optional port, without a path or trailing slash) and set
`JOBPULSE_API_TOKEN`. Send the token as `Authorization: Bearer <token>`.
Setting a token requires it for all protected requests, including local clients;
external origins and non-loopback clients cannot use token-free access. Origin
checks apply even with a valid token. Health/version endpoints remain public.
Never expose the server through a tunnel or reverse proxy without a token; wildcard
tunnel domains are never trusted implicitly.

## Safety

The scraper service role key stays in the local process. Candidate records remain behind Supabase RLS. Deduplication transfers user statuses and evaluations through the service-only database RPC before deleting a duplicate. Age, an empty crawl or source failure never authorizes vacancy deletion. The CLI rejects `--prune-only`; the service-only SQL pruning RPC returns zero. The scraper never returns candidate data in API responses.

Full sync responses retain `prune_stats: {}` for compatibility with existing consumers;
there is no pruning phase. New retirement behavior requires source-specific closure
evidence, preservation of candidate tracking and regression tests. See
[Regression Prevention](REGRESSION_PREVENTION.md).

Run `make scrape-lint` and `make scrape-unit` after changes to this service.

## Full description ingestion

Synchronous ingestion retrieves missing posting details by default; durable ingestion
queues independent detail tasks. Both preserve complete API
bodies rather than listing snippets. JobsIreland persists listing pages before
fetching missing bodies sequentially; completed bodies act as retry checkpoints,
and the first unusable detail response stops further detail requests. Failed detail requests cannot erase a stored
body, and new metadata-only listings are stored but not embedded, so they stay
visible and repairable. The catalog repair command updates descriptions in place,
preserving job IDs and candidate tracking. Job embeddings cover the complete body
through token windows. See
[Published job descriptions and semantic coverage](OPERATIONS.md#published-descriptions)
for repair commands, body-gate limits and unresolved-source handling.

## Employer metadata and vacancy locations

Employer identity resolution uses exact case-insensitive database names with literal
wildcard escaping and rejects ambiguous matches. Explicit curated aliases may resolve
known companies; no substring identity search or public geocoding runs during ingestion.
Failed persistence never caches an employer without an ID.

Employer headquarters remain in `employers`; published vacancy locations stay in `jobs`.
Ingestion accepts only complete, finite posting coordinate pairs, preserves zero values,
and writes `coordinate_source='posting'`. Coordinates without a verified source remain stored with unknown
provenance and are hidden in paginated results and deep-link details.

`employers.metadata_source` distinguishes `curated`, `watchlist`, `verified`, and
`unverified` metadata. Trusted `employers.sector` values define the single public
catalog sector; unknown and unverified values contribute `Uncategorized`.
Overview `categories` and page `p_sector` share this definition. Candidate role-sector assessments
remain private scoring inputs; this display classification does not rewrite them.
Match averages include assessed jobs only.

After persistence, a bounded employer-office worker researches distinct company/place
pairs and saves additive addresses, coordinates and website/category evidence. It uses
persistent retry dates rather than repeating research for each vacancy. The map's
separate office layer labels workplaces as unconfirmed; vacancy facts remain independent.
See [employer office enrichment](OPERATIONS.md#employer-research-and-offices).

After persistence, when `GEOAPIFY_API_KEY` is configured, the synchronization runner
checks up to 100 pending job locations through a separate bounded verification stage.
It caches external results, records each job's original location and precision, and
never substitutes employer headquarters. Provider failures do not roll back ingestion.
See [job location verification](OPERATIONS.md#vacancy-location-verification).

Employer linking and metadata enrichment are separate from ingestion. Shared metadata
writes require reviewed exact identity and field evidence, with compare-and-set guards;
vacancy titles or model output alone are not verification. Programme sponsorship does
not establish a client's industry. Research produces proposals; only the reviewed
registry/stored-witness workflow promotes metadata. See
[reviewed employer operations](OPERATIONS.md#reviewed-employer-metadata) for commands,
evidence formats and location repair.

## External company research

`tools/research_employers.py` reads linked employer identities from stored JobsIreland
catalog rows, independently of job-board availability. Provider access
and the response cache live in `pipeline/company_research.py`; Wikidata supplies
company discovery and Geoapify supplies explicit street-address geocoding. Results
are review proposals, never ingestion-time industry or vacancy-location inference.
Reviewed metadata can be previewed/applied through `tools/enrich_employers.py --registry`.
See [the operational guide](OPERATIONS.md#employer-research-and-offices) for configuration and evidence rules.
