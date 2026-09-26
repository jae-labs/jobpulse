#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "Storage export requires the linked project; a database URL cannot identify its Storage project." >&2
  exit 2
fi

if [[ -n "${BACKUP_DIR:-}" ]]; then
  backup_dir="$BACKUP_DIR"
else
  backup_dir=".backups/storage-$(date -u +%Y%m%dT%H%M%SZ)"
fi

umask 077
mkdir -p "$backup_dir/storage"

bucket_dump="$(mktemp)"
trap 'rm -f "$bucket_dump"' EXIT
chmod 600 "$bucket_dump"

supabase db dump --linked --data-only --schema storage --use-copy -f "$bucket_dump"

bucket_count=0
while IFS= read -r bucket; do
  [[ -z "$bucket" ]] && continue
  echo "Exporting Storage bucket: $bucket"
  supabase storage cp --linked --experimental --recursive "ss:///$bucket" "$backup_dir/storage/$bucket"
  bucket_count=$((bucket_count + 1))
done < <(
  awk '
    /^COPY (storage\.buckets|"storage"\."buckets") / { in_buckets = 1; next }
    in_buckets && /^\\\.$/ { exit }
    in_buckets { print $1 }
  ' "$bucket_dump"
)

echo "Storage export completed: $backup_dir/storage ($bucket_count bucket(s))"
