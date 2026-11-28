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

if [[ ! -d "$backup_path/storage" ]] || [[ -n "$(find "$backup_path" -type l -print -quit)" ]]; then
  echo "Backup must include Storage exports and contain no symbolic links; local data was not changed." >&2
  exit 1
fi

# Bind every CLI operation to this repository, even when invoked from elsewhere.
cd "$repo_root"
project_id="$(node -e '
  const fs = require("node:fs");
  const match = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m.exec(fs.readFileSync("supabase/config.toml", "utf8"));
  if (!match) process.exit(1);
  process.stdout.write(match[1]);
')"
db_container="supabase_db_$project_id"
docker_endpoint="$(docker context inspect --format '{{ .Endpoints.docker.Host }}')"
case "$docker_endpoint" in unix://*|npipe://*) ;; *) echo "Restore requires a local Docker socket." >&2; exit 1 ;; esac
case "${DOCKER_HOST:-$docker_endpoint}" in unix://*|npipe://*) ;; *) echo "Remote DOCKER_HOST is forbidden for restore." >&2; exit 1 ;; esac

if ! docker container inspect "$db_container" >/dev/null 2>&1; then
  echo "Local Supabase database container was not found: $db_container" >&2
  exit 1
fi

if ! (cd "$backup_path" && shasum -a 256 -c SHA256SUMS); then
  echo "Backup integrity verification failed; local data was not changed." >&2
  exit 1
fi

# Migrations seed application and Storage rows. Replace only exported tables;
# tables absent from an older snapshot retain their migration defaults.
restore_tables="$(awk '
  /^COPY "(auth|public|storage|supabase_functions)"\."[a-z_][a-z0-9_]*" / { print $2 }
  /^COPY (auth|public|storage|supabase_functions)\.[a-z_][a-z0-9_]* / { print $2 }
' "$backup_path/data.sql" | sort -u | paste -sd, -)"
if [[ -z "$restore_tables" ]]; then
  echo "Backup has no COPY-format application tables; local data was not changed." >&2
  exit 1
fi

echo "Resetting only the local Supabase database..."
supabase --workdir "$repo_root" db reset --local --no-seed

echo "Restoring backup data from $backup_path..."
{ printf 'TRUNCATE TABLE %s;\n' "$restore_tables"; cat "$backup_path/data.sql"; } | docker exec -i "$db_container" psql \
  --single-transaction \
  --set ON_ERROR_STOP=1 \
  --username supabase_admin \
  --dbname postgres

echo "Recreating the local development account..."
docker exec -i "$db_container" psql \
  --set ON_ERROR_STOP=1 \
  --username postgres \
  --dbname postgres < "$repo_root/supabase/local-dev-account.sql"

bash "$repo_root/scripts/import-storage.sh" "$backup_path"

echo "Local backup restore completed."
