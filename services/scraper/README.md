# JobPulse scraper

The scraper discovers Irish employer openings, extracts job details, generates job embeddings, and saves vacancy facts to Supabase. See [pipeline architecture](../../docs/SCRAPER_ARCHITECTURE.md) for the data flow and module boundaries.

## Configure employers

Edit [`config/websites.yaml`](config/websites.yaml) to add or pause a source:

```yaml
- name: Dublin Port Company
  sector: Transport & Logistics
  priority: 85
  careers_url: https://www.dublinport.ie/careers/
  enabled: true
  scraper: generic_crawler
```

Set `enabled: false` to pause it. Run `make scrape-validate` from the repository root to check the configuration.

## Run

| Command | Purpose |
| --- | --- |
| `make scrape-test NAME="The Housing Agency"` | Scrape one employer |
| `make scrape-core` | Run specialized scrapers |
| `make scrape` | Scrape, deduplicate, and embed jobs |
| `make scrape-backfill` | Generate missing vectors for existing jobs after migration |
| `make scrape-lint` | Check Python lint and formatting |
| `make scrape-unit` | Run Python tests |

For local development, start the Supabase stack with `make dev`. If running the scraper separately, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `services/scraper/.env`. Keep the service role key out of the frontend and Git.

For a fresh scraper environment (Python 3.11+; CI baseline 3.12):

```bash
cd services/scraper
uv sync --locked --python 3.12
uv run --locked playwright install chromium
```

Chromium is required by browser-backed sources; install its OS dependencies too on Linux if prompted.

Python dependencies are managed by `pyproject.toml` and `uv.lock`; commands use `uv run --locked`.
Candidate scoring runs in PostgreSQL; the scraper does not load profile or scoring rules.
Vacancies are retained when a source is old, empty or unavailable. The former
`--prune-only` command has been removed; retirement needs source-specific closure evidence.
Use backfill only for missing vectors or an intentional model migration; it is not a routine startup step.

After schema changes, run `make db-types` from the repository root to regenerate both language models.
