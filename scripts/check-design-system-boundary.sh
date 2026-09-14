#!/usr/bin/env bash

set -euo pipefail

design_system_dir="src/design-system"

if rg --line-number --glob '*.{ts,tsx}' "from ['\"]\.\./\.\." "$design_system_dir"; then
  echo "Design-system modules must not import from the application. Use a local module or an external dependency." >&2
  exit 1
fi

if rg --line-number --glob '*.{ts,tsx}' "(supabase|useTranslation|useQuery|useMutation|react-router)" "$design_system_dir"; then
  echo "Design-system modules must not depend on product data, localization, routing, or Supabase." >&2
  exit 1
fi

if rg --line-number --glob '*.{ts,tsx}' --glob '!*.test.{ts,tsx}' "(?:bg|text|border|ring|placeholder:text|decoration)-(?:\[\#|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-)" src --glob '!design-system/**'; then
  echo "Use semantic design-system tokens instead of raw palette or hex colors in application UI." >&2
  exit 1
fi
