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
Use its exported `cn` helper for class composition; the application does not keep a second implementation.

## Boundary and Verification

The dependency direction is JobPulse → `@jae-labs/ui`. The package must not import application models,
Supabase, routes, hooks, libraries, translations, or feature code. The root
[`scripts/check-design-system-boundary.sh`](../scripts/check-design-system-boundary.sh) runs during `npm run lint`
and in CI. It rejects application imports, literal hex/rgb colors, raw palette utilities, and arbitrary
border-radius classes (enforcing `rounded-ds-control`, `rounded-ds-card`, or `rounded-full`), then validates
token references. Oxlint also blocks forbidden imports at the module level. Follow the
[required verification contract](../AGENTS.md#required-verification) for UI changes.
CI builds the standalone catalog and runs blocking accessibility, interaction, coverage and visual gates.
The [package verification guide](../packages/ui/DESIGN.md#storybook-and-verification) owns baseline updates
and the pinned Linux rendering environment.

The application maps domain statuses to the generic `Pill.tone` API in
[`src/lib/statusTone.ts`](../src/lib/statusTone.ts).

Chart tooltip copy follows the data-first guidance in [`packages/ui/DESIGN.md`](../packages/ui/DESIGN.md):
show labels and values without repeated click instructions. The
[`scripts/check-chart-tooltip-copy.mjs`](../scripts/check-chart-tooltip-copy.mjs) check runs during `npm run lint`.

## Data Visualization & Rendering Performance

Rendering rules live in [Performance & Scalability](PERFORMANCE_AND_SCALABILITY.md#2-main-thread--rendering-performance):
cached theme reads, disabled dashboard chart animations and stable memoized props.

Overview chart surfaces use `WidgetCard` from `@jae-labs/ui` for consistent padding, heading typography and content gaps. Reorder controls remain in `SortableWidget`; chart legends follow their plots.
