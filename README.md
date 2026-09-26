# JobPulse

JobPulse pairs a React dashboard with a Python scraper that finds, scores, and tracks Irish job opportunities. Supabase stores candidate data, job evaluations, and documents.

## Quick start

```bash
mise install
pnpm install
npm run prepare
make dev
```

`make dev` starts local Supabase, the account deletion Edge Function, and Vite. It uses a local development account; hosted credentials are unnecessary. In another terminal, run `make scrape-validate` or `make scrape-test NAME="Kildare County Council"` to check the scraper.

## Common commands

| Command | Purpose |
| --- | --- |
| `make help` | List all local tasks |
| `make check` | Run frontend and scraper checks |
| `make scrape` | Scrape, deduplicate, prune, and rescore |
| `make scrape-test NAME="..."` | Scrape one employer |
| `make db-types` | Regenerate TypeScript and Python database types |
| `npm run storybook` | Inspect UI components |

## Repository map

- `src/`: React application, queries, localization, and domain types.
- `packages/ui/`: Reusable components and design tokens.
- `services/scraper/`: Python discovery, extraction, scoring, and ingestion.
- `supabase/`: Migrations, seed data, SQL tests, and Edge Functions.
- `docs/`: Architecture and operating guides.

The browser uses a publishable Supabase key and user-scoped RLS. The scraper alone uses the service role key. Keep `.env` files and `.backups/` out of Git.

## Guides

- [Architecture](docs/ARCHITECTURE.md) and [components](docs/COMPONENTS.md)
- [Scraper pipeline](docs/SCRAPER_ARCHITECTURE.md) and [scraper setup](services/scraper/README.md)
- [Local development](docs/LOCAL_DEVELOPMENT.md) and [release recovery](docs/RELEASE_AND_RECOVERY.md)
- [Database schema](docs/DATABASE_SCHEMA.md) and [security](docs/SECURITY_AND_MULTI_TENANCY.md)
- [Design system](packages/ui/DESIGN.md) and [engineering standards](docs/STANDARDS_AND_CONVENTIONS.md)

MIT licensed. See [LICENSE](LICENSE).
