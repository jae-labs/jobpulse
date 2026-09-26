# Design System Integration

[`@jae-labs/ui`](../packages/ui/) is the private workspace package for reusable UI. Its
[DESIGN.md](../packages/ui/DESIGN.md) is the source of truth for design decisions, component rules, styling,
and accessibility. Agents changing the package also follow [packages/ui/AGENTS.md](../packages/ui/AGENTS.md).

## JobPulse Wiring

JobPulse imports components from the package entry point:

```tsx
import { Button, Card, PageHeader } from '@jae-labs/ui';
```

[`src/index.css`](../src/index.css) imports `@jae-labs/ui/tokens.css` once and tells Tailwind to scan the
package source. It also maps JobPulse pipeline statuses to neutral `--ds-color-data-*` tokens through
`--jp-color-status-*` variables and `status-*` Tailwind utilities. Product status meanings stay in the app.

The package exports its components from [`packages/ui/src/index.ts`](../packages/ui/src/index.ts), with semantic
values in [`packages/ui/src/tokens.css`](../packages/ui/src/tokens.css). Application code should use the package
entry point rather than deep imports.

## Boundary and Verification

The dependency direction is JobPulse → `@jae-labs/ui`. The package must not import application models,
Supabase, routes, hooks, libraries, translations, or feature code. The root
[`scripts/check-design-system-boundary.sh`](../scripts/check-design-system-boundary.sh) runs during `npm run lint`
and in CI. It rejects application imports and raw component colors, then validates token references. Oxlint
also blocks forbidden imports at the module level. Run `npm run check` before completion and
`npm run build-storybook` after changing UI states. CI builds the standalone Storybook catalog.

The application maps domain statuses to the generic `Pill.tone` API in
[`src/lib/statusTone.ts`](../src/lib/statusTone.ts).

Chart tooltip copy follows the data-first guidance in [`packages/ui/DESIGN.md`](../packages/ui/DESIGN.md):
show labels and values without repeated click instructions. The
[`scripts/check-chart-tooltip-copy.mjs`](../scripts/check-chart-tooltip-copy.mjs) check runs during `npm run lint`.

## Data Visualization & Rendering Performance

- **Token Resolution Without Reflow**: Charts reading `--ds-color-*` or `--jp-color-status-*` variables must consume them through `getCachedCssVar` in `src/lib/chartTheme.ts` rather than `getComputedStyle(document.documentElement)`. This prevents forced synchronous layout reflows on render ticks while maintaining live theme switching via a `MutationObserver`.
- **Animation Frame Overhead**: Set `isAnimationActive={false}` on all dashboard Recharts primitives (`<Bar>`, `<Pie>`, `<Area>`) to prevent multi-chart surfaces from running simultaneous 1500ms `requestAnimationFrame` loops during initial paint and navigation.
- **Component Memoization**: Chart components in `src/components/charts/` are wrapped in `React.memo` to isolate chart rendering from parent state changes (such as search keystrokes or virtual list scrolling).
