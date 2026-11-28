# JobPulse scraper

The scraper discovers Irish employer openings, extracts job details, generates job embeddings, and saves vacancy facts to Supabase. See [pipeline architecture](../../docs/SCRAPER_ARCHITECTURE.md) for the data flow and module boundaries.

## Configure employers

`public.boards` controls generic crawl targets. Pause a live board by setting its
`enabled` field to false; rejected and retired boards are not crawled. An empty
catalog stays empty. YAML is used only when the database catalog is unavailable.

Edit [`src/jobpulse_scraper/config/websites.yaml`](src/jobpulse_scraper/config/websites.yaml) to change the bootstrap seed:

```yaml
- name: Dublin Port Company
  sector: Transport & Logistics
  priority: 85
  careers_url: https://www.dublinport.ie/careers/
  enabled: true
  scraper: generic_crawler
```

Run `make scrape-validate` from the repository root to validate the YAML. Preview
the import, then apply reviewed changes from the repository root:

```bash
make scrape-import-boards
make scrape-import-boards ARGS="--apply"
make scrape-backfill-board-employers
make scrape-list-boards
```

Imports update matching live boards, including their enabled state. Database-only
boards remain intact. The importer also accepts an optional local
`config/board_seeds.yaml`; it is not required or supplied in the checkout.
See [board operations](../../docs/OPERATIONS.md#board-catalog) for discovery and employer linking.

## Run

| Command | Purpose |
| --- | --- |
| `make scrape-test NAME="The Housing Agency"` | Scrape one employer |
| `make scrape-core` | Run specialized scrapers |
| `make scrape-boards ARGS="--limit 50"` | Crawl only database boards, bounded by target count |
| `make scrape` | Process due work and queue eligible sources with six-hour success/failure intervals |
| `make scrape ARGS="--sync"` | Run the synchronous scrape, detail, embedding and deduplication pipeline |
| `make scrape-backfill` | Generate missing vectors for existing jobs after migration |
| `make scrape-enqueue ARGS="--limit 20"` | Queue enabled targets durably |
| `make scrape-worker ARGS="--limit 20"` | Drain bounded source/detail/vector tasks |
| `make scrape-history` | Inspect public-source request evidence and denials |
| `make scrape-package` | Build and verify the installable wheel |
| `make scrape-pilot` | Evaluate engines on synthetic ATS, HTML and browser fixtures |
| `make scrape-lint` | Check Python lint and formatting |
| `make scrape-unit` | Run Python tests |

`make scrape` processes up to the supported maximum of 10,000 due tasks and exits
early when none remain. `make scrape ARGS="--limit 100"` sets a smaller task budget. Automatic draining
uses four task slots sharing that budget. `ARGS="--concurrency 1 --task-timeout 180"`
selects one slot and a three-minute hard task deadline; defaults are four slots and
120 seconds, with a four-slot maximum. Reusable task processes retain warm models
and clients. Timeouts stop the task's process tree, preserve committed facts and
record an incomplete result for scheduled retry. Database claims rotate due
source/detail/vector work and give supported adapters regular turns ahead of
generic discovery; apply the forward migrations to the selected database.
Automatic startup
queues eligible enabled sources independently in batches of at most 1,000 sources.
Catalog size does not limit the total sources queued. Pending or running source tasks keep
their progress and retry dates. Completed sources refresh after at least six hours;
failed source crawls retry after at least six hours, with longer remote delays
preserved. Delayed failures do not block eligible peers. Exhausted retries need
explicit enqueueing. Detail/vector retries keep their separate backoff.
`make scrape-worker` never seeds sources; it only processes existing due work.
Workers flush timestamped JSON progress to stderr for task starts, processing
stages, persisted outcomes, retries and lease loss. Active tasks report elapsed
time during lease renewal, normally every thirty seconds. Final JSON counts
remain on stdout. Progress never includes response bodies, credentials or raw exceptions.
Every Make scraper command automatically saves stdout and stderr together to a
unique `logs/<make-target>-<UTC-timestamp>-<suffix>.log` under the repository root.
The terminal prints the log path at startup and keeps both streams live and separate.
`make scrape-report` reads the latest 100 finished source/detail/vector runs.
`make scrape` and `make scrape-worker` also archive that report automatically
after each drain and print its path. Use ten-task batches for an investigation,
review each log/report, then adjust one source or transport policy and remeasure.
The maintained [agent process](../../AGENTS.md#scraper-measurement-and-improvement-process)
defines the campaign and verification contract.
Use `ARGS='--employer "Company"'` to compare one company's duration, request
rates, transport mix, rate-limit evidence and ingestion-input body coverage.
Metrics persist in each durable run result and the local bounded SQLite ledger.
Generic sources learn successful browser extraction, skip redundant HTTP probes
for seven days, and return to HTTP probing after expiry or three failures.

Logs have owner-only permissions and include command completion or interruption status;
the wrapper preserves exit codes and forwards interrupts. Python output is unbuffered.
`logs/` is Git-ignored. Review or remove local logs as needed; they are separate from
bounded database history and snapshot retention. Direct Python or installed CLI
invocations keep their normal streams and do not use the Make logging wrapper.
Explicit employer/core and
maintenance commands retain their supported behavior.

Discovery, research, enrichment and verification helpers are listed in
[the operating workflow](../../docs/OPERATIONS.md#scraping-and-matching-workflow).
Use `ARGS="--help"` to inspect their flags. Crawls write shared vacancies; discovery
and enrichment helpers preview unless explicitly given `--apply`.

For local development, start the Supabase stack with `make dev`. If running the scraper separately, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `services/scraper/.env`. Keep the service role key out of the frontend and Git.

For a fresh scraper environment (Python 3.11+; CI baseline 3.12):

```bash
cd services/scraper
uv sync --locked --python 3.12
uv run --locked playwright install chromium
```

Chromium is required by browser-backed sources; install its OS dependencies too on Linux if prompted.

The installed entrypoint is `jobpulse-scraper`; `python -m jobpulse_scraper.app`
provides the same flags. `app.py` preserves service-root invocations. Package imports
use `jobpulse_scraper.*`; configuration resources ship in the wheel. Set
`JOBPULSE_SCRAPER_HOME` for an explicit environment/configuration home and
`JOBPULSE_CRAWL_STATE` for writable snapshots. No privileged credentials ship in the
package. Offline replay uses `--replay <snapshot-metadata-key>`.

Python dependencies are managed by `pyproject.toml` and `uv.lock`; commands use `uv run --locked`.
Candidate scoring runs in PostgreSQL; the scraper does not load profile or scoring rules.
Vacancies are retained when a source is old, empty or unavailable. The CLI rejects
`--prune-only`; retirement needs source-specific closure evidence.
Use backfill only for missing vectors or an intentional model migration; it is not a routine startup step.

Shared HTTP requests use a certificate-error fallback; review the
[network policy](../../docs/SCRAPER_ARCHITECTURE.md#network-policy) and its security tradeoff.

After schema changes, run `make db-types` from the repository root to regenerate both language models.

The scraper CI job installs Chromium and Linux system dependencies through the
locked Python Playwright package before pytest. Browser runtime tests exercise
real rendering and request budgets; the frontend browser installation belongs to
a separate CI job and does not provide the scraper runtime.

Public CRO and regional Overture snapshots are downloaded and indexed locally with
`make scrape-company-index` from the repository root. `make scrape-company-pilot`
reports review-only identity coverage for 200 public employers. Files stay in the
Git-ignored `.backups/company-index/` directory. See
[local company index operations](../../docs/OPERATIONS.md#local-irish-company-index)
for refresh, provenance, attribution and evidence limits.
