#!/usr/bin/env bash

set -euo pipefail

supabase start

latest_backup=""
shopt -s nullglob
for backup_dir in .backups/jobpulse-*; do
  if [[ -f "$backup_dir/data.sql" && -f "$backup_dir/.complete" ]] && [[ -z "$latest_backup" || "$backup_dir/data.sql" -nt "$latest_backup/data.sql" ]]; then
    latest_backup="$backup_dir"
  fi
done

if [[ -n "$latest_backup" ]]; then
  read -r -p "Import local backup $latest_backup before starting? This resets local data [y/N] " import_backup || import_backup=""
  if [[ "$import_backup" =~ ^[Yy]$ ]]; then
    bash scripts/restore-local-backup.sh "$latest_backup"
  fi
else
  echo "No local backup found; starting with the existing local database."
fi

status_json="$(supabase status --output json)"
IFS=$'\t' read -r local_url local_anon_key < <(
  printf '%s' "$status_json" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const start = input.indexOf("{");
      const end = input.lastIndexOf("}");
      if (start === -1 || end === -1) process.exit(1);
      const status = JSON.parse(input.slice(start, end + 1));
      if (!status.API_URL || !status.ANON_KEY) process.exit(1);
      process.stdout.write(`${status.API_URL}\t${status.ANON_KEY}\n`);
    });
  '
)

if [[ -z "${local_url:-}" || -z "${local_anon_key:-}" ]]; then
  echo "Unable to read the local Supabase API URL and anon key." >&2
  exit 1
fi

supabase functions serve delete-account &
functions_pid=$!
cleanup() {
  kill "$functions_pid" 2>/dev/null || true
  wait "$functions_pid" 2>/dev/null || true
}
trap cleanup EXIT

VITE_SUPABASE_URL="$local_url" \
VITE_SUPABASE_PUBLISHABLE_KEY="$local_anon_key" \
VITE_SUPABASE_ANON_KEY="$local_anon_key" \
VITE_SKIP_AUTH=true \
vite "$@"
