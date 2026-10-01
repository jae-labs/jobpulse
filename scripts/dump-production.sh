#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  db_target=(--db-url "$SUPABASE_DB_URL")
else
  db_target=(--linked)
fi

if [[ -n "${BACKUP_DIR:-}" ]]; then
  backup_dir="$BACKUP_DIR"
else
  backup_dir=".backups/jobpulse-$(date -u +%Y%m%dT%H%M%SZ)"
fi

umask 077
mkdir -p "$backup_dir"

echo "Writing local backup files to $backup_dir"
supabase db dump "${db_target[@]}" --role-only -f "$backup_dir/roles.sql"
supabase db dump "${db_target[@]}" -f "$backup_dir/schema.sql"
supabase db dump "${db_target[@]}" --data-only --use-copy -f "$backup_dir/data.sql"

echo "Database backup completed: $backup_dir"
echo "Storage objects are not included; back them up separately if the project uses Supabase Storage."
