#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "make backup requires the linked project so database and Storage come from the same source. Use make dump for a SUPABASE_DB_URL-only database backup." >&2
  exit 2
fi

backup_dir="${BACKUP_DIR:-.backups/jobpulse-$(date -u +%Y%m%dT%H%M%SZ)}"

BACKUP_DIR="$backup_dir" bash scripts/dump-production.sh
BACKUP_DIR="$backup_dir" bash scripts/export-storage.sh
(cd "$backup_dir" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS)
touch "$backup_dir/.complete"

echo "Production backup completed: $backup_dir"
