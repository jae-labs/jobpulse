# Local Development, Backups & Restore

## Default Development Workflow

Normal development uses local Supabase for database, Auth, and Storage requests.

```bash
mise install
pnpm install
make dev
```

`make dev` starts Supabase, the account-deletion Edge Function, and Vite. It
injects local credentials and signs in as a seeded user with RLS enabled.

Use `make help` for the complete command list. Common commands are:

```bash
make stop
make db-status
make db-reset
make db-restore BACKUP=.backups/jobpulse-<timestamp>
make check
```

`npm run dev` is the same local workflow. `npm run dev:hosted` is explicit and
requires intentionally configured hosted Supabase credentials in `.env`.

## Migration Workflow

Migrations are the schema source of truth. A local reset reapplies them before
restoring backup data.

```bash
npm run db:migration <name>
make db-reset
npm run db:diff
npm run db:push
npm run db:types
npm run check
```

Review `npm run db:diff` before pushing to the linked project. Never edit an
applied migration; create a forward migration.

## Backups and Storage

Backups are local-only, owner-readable files under `.backups/` and are ignored
by Git. They can contain personal data and must never be committed or shared.

```bash
make backup
```

`make backup` reads the linked project only. It exports database roles, schema,
and data plus every discovered Storage bucket. It does not modify production.
To restore locally, start `make dev` and confirm the import prompt, or run:

```bash
make db-restore BACKUP=.backups/jobpulse-<timestamp>
```

The restore order is local migrations, production data, the local development
account, and exported Storage files. Database data is imported as dumped; only
the local development account and local Storage metadata required to upload the
backed-up files are created or replaced locally.

## Test Account Deletion

After `make dev`, run `node scripts/test-account-deletion-local.mjs` in another
terminal. If only Supabase is running, first run
`supabase functions serve delete-account`. The script creates and deletes a
disposable account, checks Auth, rows, and Storage cleanup, and rejects
non-local API URLs.

For a database-only backup that cannot use the linked project connection, use:

```bash
SUPABASE_DB_URL='postgresql://…' make dump
```

Storage export requires a linked Supabase project, so `make backup` rejects
`SUPABASE_DB_URL` rather than combine database and Storage from different
projects.

## Running the Scraper Pipeline Locally

The Python scraper service lives in `services/scraper/` and is designed to run locally on your machine.

### Environment Setup

1. Check your local Supabase credentials:

   ```bash
   make db-status
   ```

2. Copy `services/scraper/.env.example` to `services/scraper/.env`:

   ```bash
   cp services/scraper/.env.example services/scraper/.env
   ```

3. Set `SUPABASE_URL` to `http://127.0.0.1:54321` and paste the `service_role` key from `make db-status`.

### Development & Execution Commands

```bash
# Validate config/websites.yaml
make scrape-validate

# Test scraping for a specific employer
make scrape-test NAME="Kildare County Council"

# Run core scrapers only (universities, councils, PublicJobs)
make scrape-core

# Run the full scraping + deduplication + candidate fit rescore pipeline
make scrape

# Rescore candidate fit against existing opportunities using Apple Metal GPU
make scrape-rescore

# Run code quality checks on scraper Python code
make scrape-lint
make scrape-unit
```
