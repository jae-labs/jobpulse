# Design System

## Purpose and boundary

The design system keeps JobPulse visually coherent while remaining independent
of JobPulse data, routes, Supabase, and translation keys. Its source lives in
`src/design-system/` so it can be extracted later into a versioned package
(for example, `@jae-labs/ui`) without changing its public API.

Application code owns composition and copy. The design system owns reusable
visual primitives, semantic tokens, interaction states, and accessibility
defaults.

## Using it

Import components from the single public entry point:

```tsx
import { Button, Card, PageHeader, TextField } from '../design-system';
```

`src/index.css` imports `src/design-system/tokens.css` for JobPulse. A future
consumer must import that token file (or provide equivalent `--ds-*` values)
before using the components.

Available primitives:

- `Button`: primary, secondary, ghost, and danger actions with shared focus,
  disabled, size, and press states.
- `Card`: the standard content surface.
- `PageHeader`: page title, optional description, and optional actions.
- `TextField` and `Select`: accessible native form controls with shared
  borders, focus, placeholder, and typography treatment.
- `EmptyState`: data-free state with supplied copy, icon, and action.
- `Pill`: interactive or presentation pills for filters, pipeline stages, and
  categories with uniform hover/active intensities and semantic token support.

`src/components/ui/button.tsx` remains a compatibility export. New code must
import from `src/design-system` directly.

## Tokens

Only semantic tokens are public API. Components must use them rather than
hard-coded colors:

| Intent | Token |
| --- | --- |
| App canvas | `--ds-color-canvas` |
| Main workspace | `--ds-color-workspace` |
| Content surface | `--ds-color-panel` |
| Input or compact control | `--ds-color-control` |
| Hovered surface | `--ds-color-hover` |
| Default / strong boundary | `--ds-color-border` / `--ds-color-border-strong` |
| Primary / secondary / muted text | `--ds-color-text-primary`, `--ds-color-text-secondary`, `--ds-color-text-muted` |
| Keyboard focus and selected state | `--ds-color-accent`, `--ds-color-accent-subtle` |
| Success and destructive status | `--ds-color-positive`, `--ds-color-negative` |

Tailwind equivalents use the `ds-*` names, such as `bg-ds-panel`,
`text-ds-text-muted`, and `border-ds-border`. Product status colors remain
semantic status indicators, not a substitute for structural colors.

## Composition rules

- Start each new route with a `PageHeader` and use `Card` for grouped content.
- Use `Button` rather than hand-styled buttons, except for compact segmented
  controls or icon-only controls that have an intentionally distinct pattern.
- Use `TextField` and `Select` for ordinary forms. Always supply a visible
  label or an accessible name.
- Keep user-facing copy and localization in the application. Design-system
  components accept nodes; they do not import `useTranslation`.
- Do not import application types, hooks, query clients, routes, or Supabase
  clients into `src/design-system/`.
- Do not add raw hex colors, `text-zinc-*`, `bg-zinc-*`, or one-off surface
  colors to new route code. Add a semantic token first if the visual meaning
  is broadly reusable.

## Visual and accessibility baseline

- Inter is the UI font. Use tabular figures for dense metrics where alignment
  matters.
- Standard surface radius is `--ds-radius-card`; controls use
  `--ds-radius-control`.
- Use the global `ds-focus-ring`; never remove visible keyboard focus.
- Text and control boundaries must meet WCAG 2.1 AA requirements described in
  [Engineering Standards](STANDARDS_AND_CONVENTIONS.md).
- Verify changed screens at a 320px viewport, with keyboard-only navigation,
  and with reduced motion enabled when animation changes.

## Extraction contract

When another application needs these primitives, move `src/design-system/`
into its own package unchanged, publish its `index.ts` as the public entry
point, and make each application own its token theme. The lint gate runs
`scripts/check-design-system-boundary.sh` to keep this folder free of
application-relative imports, data access, routing, and localization; it also
rejects new raw structural color utilities in application UI. Do not extract
JobPulse-specific views, localization bundles, icons, domain status labels, or
data-fetching code with it.
