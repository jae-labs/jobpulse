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
If the existing local database is behind the checkout, apply pending forward
migrations with `supabase migration up --local`. This preserves existing data.
If its history diverges from the checkout, back up the local data and reconcile
the branch/history before rebuilding it. `make db-reset` deletes local data;
reserve it for disposable databases or a deliberate, backed-up rebuild.

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

Migrations are the schema source of truth. Create a forward migration, then apply it
without deleting data on the existing developer stack:

```bash
npm run db:migration <name>
# Write the schema change in the generated migration file.
supabase migration up --local
make db-types
make check
npm run db:test
```

Verify the baseline plus forward migrations separately on a disposable local stack;
`supabase db reset --local` deletes data and is only appropriate for that stack or a
deliberate backed-up rebuild. Review generated TypeScript and Python changes together.
Hosted application follows [Release and recovery](RELEASE_AND_RECOVERY.md), including
backup, target verification and local validation before `npm run db:push`.
Never edit an applied migration.

The pre-push tenant gate requires an exact local migration ledger. After pulling
new migrations, update your running local database and rerun the gate:

```bash
supabase migration up --local
npm run db:test:tenancy
```

The test runner never applies migrations or resets a database automatically.

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

Before resetting, restore validates checksums, requires the Storage export,
rejects symbolic links, and verifies a local Docker target. It binds the CLI to
this checkout and replaces exported table data in one transaction after running
migrations. Fresh development starts seed `local-dev-account.sql` followed by
`seed.sql`; snapshot restore runs only the developer-account seed, preserving
the restored catalog instead of inserting demo jobs.

## Test Account Deletion

After `make dev`, run `npm run db:test:account-deletion` in another
terminal. If only Supabase is running, first run
`supabase functions serve delete-account`. The script creates and deletes
two disposable accounts, checks Auth, rows, invitations, Storage cleanup,
foreign-account denial, upload races and session revocation, and rejects
non-local API URLs.

For a database-only backup that cannot use the linked project connection, use:

```bash
SUPABASE_DB_URL='postgresql://…' make dump
```

Prefer loading the URL from your private environment rather than typing a
credential into shell history. The explicit-URL path strips passwords from CLI
arguments, uses the CLI's credential-free dump filters, and passes libpq credentials
by environment to the checksum-pinned official PostgreSQL container. SQL output
has private file permissions. A linked dump uses the CLI's linked credential path.

Storage export requires a linked Supabase project, so `make backup` rejects
`SUPABASE_DB_URL` rather than combine database and Storage from different
projects.

## Running the Scraper Pipeline Locally

The Python scraper service lives in `services/scraper/`. Follow its [environment bootstrap](../services/scraper/README.md#run) to install locked dependencies and Chromium before crawling.
All Make scraper commands print their log path and automatically record output in
the repository's Git-ignored `logs/` directory. See [worker logging](OPERATIONS.md#scraping-and-matching-workflow)
for live monitoring and local cleanup.

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

4. Populate an empty local board catalog from the reviewed YAML seed:

   ```bash
   make scrape-import-boards
   make scrape-import-boards ARGS="--apply"
   make scrape-list-boards
   ```

   An available empty catalog does not trigger YAML fallback. Re-importing updates
   matching boards, including their enabled state; use database `enabled=false`
   to pause a live board. See [board operations](OPERATIONS.md#board-catalog).

### Development & Execution Commands

```bash
# Validate config/websites.yaml
make scrape-validate

# Test scraping for a specific employer
make scrape-test NAME="Kildare County Council"

# Run specialized employer and aggregator feeds only
make scrape-core

# Crawl a bounded set of live boards without core feeds
make scrape-boards ARGS="--limit 50"

# Run the full scraping, deduplication and job embedding pipeline
make scrape

# Repair missing embeddings or backfill after an intentional model migration
make scrape-backfill

# Run code quality checks on scraper Python code
make scrape-lint
make scrape-unit
```

## Backup retention

Completed local backups have a maximum age of 365 days. `make backup` prunes expired completed `jobpulse-*` snapshots after the new snapshot completes. `node scripts/prune-backups.mjs` can enforce the policy separately. The cleanup refuses symlink roots and ignores incomplete or unrelated directories; operators must review/remove abandoned incomplete exports manually. Provider logs may have shorter retention; verify settings and never extend retention beyond one year.

## UI catalog and browser checks

`make storybook` (or `npm run storybook`) starts the reusable UI catalog on port 6006 without Supabase.
`npm run build-storybook` writes the
ignored `storybook-static/` build. Install Chromium with
`pnpm --filter @jae-labs/ui exec playwright install chromium` for `npm run test:ui`.
`npm run test:ui:visual` requires Docker and the built catalog; it uses a pinned Linux browser environment
and a container-local port 6007. Follow the
[UI verification guide](../packages/ui/DESIGN.md#storybook-and-verification) for reviewed fixture updates.

## Local company datasets

Company snapshots, SQLite indexes and persistent AI research proposals live in
Git-ignored `.data/company-index/` and `.data/company-research/`. These are runtime
datasets, independent of `.backups/jobpulse-*` database/Storage recovery exports.
Keep entire SQLite directories together, including WAL/SHM sidecars. Stop company
commands before moving or copying them. See [company research operations](OPERATIONS.md#combined-company-research)
for default-path relocation, explicit storage roots, cache export and refresh.
