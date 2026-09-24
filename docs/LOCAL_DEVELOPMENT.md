# Local Development, Backups & Restore

## Default Development Workflow

JobPulse runs Supabase locally in Docker for normal development. This keeps
browser database, Auth, and Storage requests on `127.0.0.1` rather than the
hosted project. The local stack also starts Supabase Realtime, but the current
frontend does not subscribe to catalog changes.

```bash
mise install
npm install
make dev
```

`make dev` starts the local stack and Vite, injects local Supabase credentials
at runtime, and signs in to an ordinary seeded local Auth account. RLS remains
active; the login screen is skipped only for local Vite development.

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

Migrations are the source of truth for the application schema. A local reset
recreates Postgres and applies every migration in order before any backup data
is imported.

```bash
npm run db:migration <name>
make db-reset
npm run db:diff
npm run db:push
npm run db:types
npm run check
```

Use `npm run db:push` only when a reviewed migration is meant for the linked
production project. Never edit an applied migration; create a new forward
migration instead. `npm run db:diff` compares local migration output to the
linked production `public` schema and must be reviewed before a schema release.

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

For a database-only backup that cannot use the linked project connection, use:

```bash
SUPABASE_DB_URL='postgresql://…' make dump
```

Storage export requires a linked Supabase project, so `make backup` rejects
`SUPABASE_DB_URL` rather than combine database and Storage from different
projects.
