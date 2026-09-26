# JobPulse scraper

The scraper discovers Irish employer openings, extracts job details, scores candidate fit, and saves results to Supabase. See [pipeline architecture](../../docs/SCRAPER_ARCHITECTURE.md) for the data flow and module boundaries.

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
| `make scrape` | Scrape, deduplicate, prune, and rescore |
| `make scrape-rescore` | Recalculate candidate fit |
| `make scrape-lint` | Check Python lint and formatting |
| `make scrape-unit` | Run Python tests |

For local development, start the Supabase stack with `make dev`. If running the scraper separately, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `services/scraper/.env`. Keep the service role key out of the frontend and Git.

After schema changes, run `make db-types` from the repository root to regenerate both language models.
