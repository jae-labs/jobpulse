# Quality, Accessibility & Compatibility

## Product Posture

JobPulse is an authenticated, personal career-management application. It intentionally uses `noindex`,
`nofollow`, and `noarchive` metadata: public search indexing would not improve the product and could expose
authentication entry points or stale product descriptions. It is not a public content site and therefore does not
publish a sitemap or canonical URL without a configured production origin.

## Accessibility Baseline

- All interactive controls must be native semantic controls, links, or a well-supported accessible primitive.
- Keyboard focus uses a visible high-contrast outline through `:focus-visible`; mouse users are not shown a focus
  ring unnecessarily.
- Navigation identifies the current page with `aria-current="page"`; icon-only controls need translated accessible
  names.
- Dialogs are implemented with Radix or cmdk primitives so focus management and Escape handling are delegated to
  tested libraries.
- Motion is reduced for users who express `prefers-reduced-motion: reduce`.
- New UI must be checked with keyboard-only navigation and a screen reader before release. Automated unit tests do
  not replace a manual screen-reader pass.

## Internationalization and Localization

- English (`en`) and Brazilian Portuguese (`pt-BR`) are the supported product locales.
- The selected locale persists in `localStorage` under `jobpulse_lng`. A Portuguese browser preference resolves to
  `pt-BR`; all other unsupported preferences fall back to English.
- `src/lib/i18n.ts` keeps `<html lang>` synchronized with the active locale. Dates and numbers are formatted through
  `Intl` helpers, never through hand-built strings.
- Both JSON bundles have an automated structural-parity test. Add a key to both bundles in the same change and use
  `t()` for every user-facing product string.

## Browser Compatibility

The supported baseline is the current and immediately previous major versions of Chrome, Edge, Firefox, and Safari,
including current mobile Safari and Chrome for Android. The app requires JavaScript, `Intl`, CSS Grid/Flexbox, and
ES2020-level browser support, which are present in those browsers.

- Dynamic viewport units include a `100vh` fallback for browsers that do not support `dvh`.
- Native scrolling is retained; visual scrollbar hiding is progressive enhancement only.
- Clipboard interactions are guarded because browser permission and secure-context rules vary by platform.

## Security and Performance Controls

- Cloudflare Pages headers set a restrictive Content Security Policy, `nosniff`, frame denial, referrer policy, and
  a restrictive permissions policy. The CSP allows only the outbound HTTPS and WebSocket connections required by
  Supabase and user document images.
- External application links must include `noopener,noreferrer` to prevent reverse-tabnabbing.
- Production bundles use vendor chunking and lazy-loaded charts. Query invalidations are debounced to protect the
  browser and API during ingestion bursts.

## Release Gate

Run `npm run check` before merge. It performs Oxlint, strict TypeScript checking, unit tests (including translation
bundle parity), and a production Vite build. For UI-affecting changes, also verify the keyboard flow and a 320px-wide
mobile viewport manually.
