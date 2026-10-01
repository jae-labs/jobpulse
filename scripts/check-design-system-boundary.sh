#!/usr/bin/env bash

set -euo pipefail

design_system_dir="packages/ui/src"

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) is required for design-system boundary checks." >&2
  exit 2
fi

if rg --line-number --glob '*.{ts,tsx}' "from ['\"](?:\.\./){2}|from ['\"]@/|from ['\"](?:src|apps)/" "$design_system_dir"; then
  echo "UI package modules must not import from the application. Use a local module or an external dependency." >&2
  exit 1
fi

if rg --line-number --glob '*.{ts,tsx}' "(supabase|useTranslation|useQuery|useMutation|react-router|react-i18next|src/(types|lib|hooks|components))" "$design_system_dir"; then
  echo "UI package modules must not depend on product data, localization, routing, or Supabase." >&2
  exit 1
fi

if rg --line-number '"(@supabase/supabase-js|@tanstack/react-query|react-router-dom|react-i18next)"' packages/ui/package.json; then
  echo "UI package dependencies must remain product-neutral." >&2
  exit 1
fi

if rg --line-number --glob '*.{ts,tsx}' "from ['\"][^'\"]*design-system" src; then
  echo "Application modules must import UI primitives from @jae-labs/ui." >&2
  exit 1
fi

if rg --line-number --glob '*.{ts,tsx}' --glob '!*.test.{ts,tsx}' "(?:bg|text|border|ring|placeholder:text|decoration)-(?:\[\#|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-)" src; then
  echo "Use semantic design-system tokens instead of raw palette or hex colors in application UI." >&2
  exit 1
fi

if rg --line-number --glob '*.{ts,tsx}' '#[[:xdigit:]]{3,8}\b|\b(?:rgba?|hsla?)\(' "$design_system_dir"; then
  echo "Literal colors belong in packages/ui/src/tokens.css, not UI component source." >&2
  exit 1
fi

if rg --line-number --glob '*.{ts,tsx}' --glob '!*.test.{ts,tsx}' '(?:bg|text|border|ring|fill|stroke)-\[(?:#|(?:rgba?|hsla?)\()|(?:rounded|shadow|p[trblxy]?|m[trblxy]?|gap)-\[' "$design_system_dir" src; then
  echo "Use semantic colors and shared spacing, radius, and shadow scales in UI components." >&2
  exit 1
fi

node scripts/check-ui-tokens.mjs
