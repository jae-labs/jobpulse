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
early when none remain. `make scrape ARGS="--limit 100"` sets a smaller task budget. Automatic startup
queues eligible enabled sources independently. Pending or running source tasks keep
their progress and retry dates. Completed sources refresh after at least six hours;
failed source crawls retry after at least six hours, with longer remote delays
preserved. Delayed failures do not block eligible peers. Exhausted retries need
explicit enqueueing. Detail/vector retries keep their separate backoff.
`make scrape-worker` never seeds sources; it only processes existing due work.
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
