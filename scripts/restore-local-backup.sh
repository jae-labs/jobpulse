#!/usr/bin/env bash

set -euo pipefail

backup_dir="${1:-}"
if [[ -z "$backup_dir" || ! -f "$backup_dir/data.sql" || ! -f "$backup_dir/.complete" || ! -f "$backup_dir/SHA256SUMS" ]]; then
  echo "Provide a completed backup directory containing data.sql, SHA256SUMS, and .complete." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_path="$(cd "$backup_dir" && pwd)"
case "$backup_path" in
  "$repo_root"/.backups/*) ;;
  *)
    echo "Backup must be inside $repo_root/.backups." >&2
    exit 1
    ;;
esac

if ! (cd "$backup_path" && shasum -a 256 -c SHA256SUMS); then
  echo "Backup integrity verification failed; local data was not changed." >&2
  exit 1
fi

echo "Resetting only the local Supabase database..."
supabase db reset --local --no-seed

db_container="supabase_db_jobpulse"
if ! docker container inspect "$db_container" >/dev/null 2>&1; then
  echo "Local Supabase database container was not found: $db_container" >&2
  exit 1
fi

echo "Removing the local bootstrap authorization record before import..."
docker exec -i "$db_container" psql \
  --set ON_ERROR_STOP=1 \
  --username postgres \
  --dbname postgres \
  --command 'TRUNCATE TABLE public.authorized_users'

echo "Restoring backup data from $backup_path..."
docker exec -i "$db_container" psql \
  --single-transaction \
  --set ON_ERROR_STOP=1 \
  --username supabase_admin \
  --dbname postgres < "$backup_path/data.sql"

echo "Recreating the local development account..."
docker exec -i "$db_container" psql \
  --set ON_ERROR_STOP=1 \
  --username postgres \
  --dbname postgres < "$repo_root/supabase/seed.sql"

bash "$repo_root/scripts/import-storage.sh" "$backup_path"

echo "Local backup restore completed."
