#!/usr/bin/env bash

set -euo pipefail

backup_dir="${1:-}"
storage_dir="$backup_dir/storage"
if [[ -z "$backup_dir" || ! -d "$storage_dir" ]]; then
  echo "No exported Storage files found; skipping Storage import."
  exit 0
fi

if ! find "$storage_dir" -type f -print -quit | grep -q .; then
  echo "No exported Storage files found; skipping Storage import."
  exit 0
fi

status_json="$(supabase status --output json)"
IFS=$'\t' read -r local_api_url local_service_role_key < <(
  printf '%s' "$status_json" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const start = input.indexOf("{");
      const end = input.lastIndexOf("}");
      if (start === -1 || end === -1) process.exit(1);
      const status = JSON.parse(input.slice(start, end + 1));
      if (!status.API_URL || !status.SERVICE_ROLE_KEY) process.exit(1);
      process.stdout.write(`${status.API_URL}\t${status.SERVICE_ROLE_KEY}\n`);
    });
  '
)

shopt -s nullglob
for bucket_dir in "$storage_dir"/*; do
  [[ -d "$bucket_dir" ]] || continue
  if ! find "$bucket_dir" -type f -print -quit | grep -q .; then
    continue
  fi

  bucket="$(basename "$bucket_dir")"
  echo "Importing Storage bucket into local Supabase: $bucket"
  while IFS= read -r -d '' object_file; do
    object_path="${object_file#"$bucket_dir"/}"
    encoded_object_path="$(node -p 'encodeURIComponent(process.argv[1]).replace(/%2F/g, "/")' "$object_path")"
    # The SQL dump already created this local metadata row. Replace only the
    # matching object through the local Storage API before uploading its bytes.
    curl --fail --silent --show-error --output /dev/null --request DELETE \
      "$local_api_url/storage/v1/object/$bucket/$encoded_object_path" \
      --header "Authorization: Bearer $local_service_role_key" || true
    supabase storage cp --local --experimental "$object_file" "ss:///$bucket/$object_path"
  done < <(find "$bucket_dir" -type f -print0)
done

echo "Local Storage import completed."
