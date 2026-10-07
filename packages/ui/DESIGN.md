# UI Design Guide

`@jae-labs/ui` is the private, reusable visual language for applications in this workspace. This guide
explains how to make UI decisions. The [public entry point](src/index.ts) lists the available components, and
[tokens.css](src/tokens.css) defines their current theme values.

## Design Philosophy

The visual direction is a restrained, dense application UI, inspired by products such as Linear. Use these
principles when choosing between otherwise valid implementations:

1. Put content before decoration.
2. Use subtle surface differences before strong shadows.
3. Use borders and tonal changes before extra elevation.
4. Reserve accents for interaction, selection, focus, and status.
5. Keep the interface quiet until attention is needed.
6. Favor useful information density over oversized whitespace.
7. Keep hierarchy clear and restrained.
8. Prefer consistency over a one-off visual treatment.

The package owns visual language and generic interaction appearance. Applications own product meaning, copy,
data, routing, and business behavior. The dependency direction is always application → `@jae-labs/ui`.

## Component Layers and Decisions

1. **Tokens** describe semantic color, type, control geometry, layers, radius, motion and shadow values.
2. **Primitives** provide generic controls and surfaces: `Button`, `TextField`, `Select`, `Textarea`, `Range`,
   `Card`, `Pill`, `Field`, `Dialog`, `Sheet`, and `Tooltip`.
3. **Patterns** compose primitives into generic arrangements: `PageHeader` and `EmptyState`.
4. **Application components** compose the package with domain behavior, such as a job card or application
   timeline. They stay in their application.

Before adding a component, search [src/components](src/components) and [src/index.ts](src/index.ts). Try
composing existing components first. Add a package component only when the behavior and visual contract make
sense in an unrelated application. Search [src/tokens.css](src/tokens.css) before adding a token. Give new
tokens semantic names and a distinct purpose; alias an existing value when two meanings share the same
default. Do not duplicate a component or add a token for a single application-specific use.

Use the package entry point in applications:

```tsx
import { Button, Card, PageHeader } from '@jae-labs/ui';

<PageHeader title={title} actions={<Button variant="primary">{actionLabel}</Button>} />
<Card><ApplicationContent /></Card>
```

The example's text and `ApplicationContent` belong to the application. The package does not import translation
hooks or domain types.

## Styling Rules

### Color and themes

- Components use semantic `--ds-color-*` variables or the corresponding Tailwind `ds-*` utilities. Do not add
  literal hex, RGB, or HSL colors to component files. Literal theme values belong in
  [src/tokens.css](src/tokens.css).
- Use `canvas` for the outer background, `surface` for the main application surface, `panel` for contained
  content, and `control` for inputs and controls. Use `hover` and `selected` for their respective states.
- Use `text-primary`, `text-secondary`, and `text-muted` for hierarchy; `border`, `border-strong`, and
  `border-control` for boundaries. Use `accent` for focus and selection, and `info`, `positive`, `warning`, or
  `negative` when that meaning is generic.
- `data-1` through `data-16` and `chart-1` through `chart-8` are neutral palette slots for distinct series or
  categories. Applications map domain statuses to these slots in application CSS, as JobPulse does in
  `src/index.css`.
- An application imports `@jae-labs/ui/tokens.css` once and makes Tailwind scan package source. Override
  `--ds-*` variables at a theme root or subtree to change the theme. `@theme inline` keeps the utilities tied
  to those semantic variables. Check contrast and all interaction states after an override.

### Space, type, borders, and elevation

- Use Tailwind's shared spacing scale for gaps and padding. Match nearby components before introducing a new
  value. Keep layout spacing in the application; keep a component's internal spacing in the package.
- Use the established typography hierarchy: page titles are prominent but compact, section and card labels are
  smaller, and supporting text is muted. Prefer existing Tailwind text sizes and weights. Use tabular numerals
  where numeric columns need alignment.
- Use hairline borders to separate adjacent surfaces. Prefer `rounded-ds-control` for controls and
  `rounded-ds-card` for cards and overlays. Use `shadow-ds-overlay` only where separation from underlying
  content needs it.
- Avoid arbitrary spacing, radius, shadow, and raw palette utilities when a shared value exists. If a new
  value is necessary, explain its role and consider a reusable token.

### States and motion

- Apply hover changes only to interactive controls and targets. Static cards, labels, and value badges should
  look the same under the pointer. Active or selected state should remain distinguishable without hover. The
  package's `ds-interactive-surface` and `ds-field-shell` helpers encode common transitions.
- Keyboard focus must remain visible. Preserve `ds-focus-ring` and control focus styles; do not remove an
  outline without an equivalent visible treatment.
- Disabled controls must look unavailable and prevent interaction. For a pending action, disable repeated
  activation, keep the label understandable, and expose progress accessibly. The current `Button` has no
  `loading` prop; do not document or assume one.
- Use `Button variant="danger"` for destructive actions. Make consequences clear in application copy and, when
  needed, a confirmation flow.
- Keep labeled action buttons text-only. Do not prepend or append emoji, decorative vector icons, or symbols
  such as `+` or a trash icon. Use an icon-only control for compact utility actions only when it has an
  accessible name. Functional state indicators such as sort direction and loading progress may use icons.
  Provider sign-in buttons may show the provider logo; locale selectors may pair a language name with its flag.
- Keep motion short and purposeful. Honor the application's reduced-motion treatment. Do not make animation
  necessary to understand state.
- Design for narrow screens first, then add responsive layout where content needs it. Controls must remain
  reachable and readable without horizontal overflow.

### Data visualization and tooltips

- Keep chart tooltips focused on the hovered item's name, value, and useful context. Omit instructional
  footers such as “Click to view…”; repeated action prompts add noise to dense dashboards.
- Make interactive chart targets recognizable through hover and focus states and a pointer cursor. Give
  keyboard-accessible targets a clear accessible name and activation path. Keep those affordances on the
  target instead of adding instructions inside every tooltip.
- Keep chart labels and descriptions concise. Remove subtitles that repeat the title or explain an obvious
  interaction.

## Component API Guidance

Choose semantic props such as `Button.variant`, `Button.size`, `Card.variant`, `Pill.tone`, or field `density` before
overriding appearance. `className` remains available in the current APIs for layout concerns such as width,
margin, grid placement, and responsive positioning. Avoid using it to replace component colors, typography,
borders, radius, shadows, or internal padding. Visual changes shared by consumers belong in the package.

`Button` also provides `quiet` for a bordered accent action and `dangerQuiet` for a
muted destructive action that turns red on hover. Use `danger` when destructive
meaning must be visible at rest; both destructive variants need clear action copy.

`Pill.tone` accepts generic semantic and palette tones. Applications map domain statuses to those tones in
their own code. Its `color` and `style` props are intentionally unavailable so visual choices go through the
token vocabulary.

## Form and overlay contracts

Use `Field` to connect a visible label, helper text and validation error to a native control:

```tsx
<Field label={label} description={helpText} error={errorText} required>
  {(controlProps) => <TextField {...controlProps} value={value} onChange={onChange} />}
</Field>
```

The render function supplies the control ID, native required state, `aria-invalid` and `aria-describedby`.
Spread those props on the actual input, select or textarea. Consumer validation owns error text; the package
links and presents it. Read-only fields remain readable and selectable; disabled fields prevent interaction.

`Button` defaults to `type="button"`. Explicitly use `type="submit"` for form submission. `asChild` preserves
native link semantics; supply an accessible link name and destination. Never use a disabled-looking link as
an unavailable action.

Compose modal content with `DialogTitle`/`DialogDescription` or `SheetTitle`/`SheetDescription`. A descriptive
heading names the dialog; `aria-describedby={undefined}` is appropriate when its structured content should
be read individually. Both overlays require localized `closeLabel` for their built-in close button. A sheet
with `hideCloseButton` needs another visible, keyboard-accessible dismissal control. Dialog `size` is
`default` for concise tasks or `wide` for structured content. Keep title text clear of the corner close control.

## Accessibility

- Use semantic HTML controls and headings. Prefer native `button`, `input`, `select`, and `textarea` behavior;
  add ARIA only when native semantics do not express the interaction.
- Every field needs a visible or programmatic label. Provide application-owned, localized copy for labels,
  helper text, errors, and empty states.
- When a field has a label, use the placeholder for a concise example (such as “e.g. Dublin”) instead of
  repeating the field name or telling the user to add a value.
- Preserve keyboard access, logical tab order, visible focus, and focus return for dialogs and sheets. Supply
  localized `closeLabel` text for icon-only close controls.
- Expose disabled, invalid, selected, pressed, and loading states to assistive technology where applicable. Do
  not rely on color alone to communicate them.
- Target WCAG 2.1 AA contrast: at least 4.5:1 for normal text and 3:1 for large text and meaningful control
  boundaries. Recheck contrast when adding or changing themes.
- Test interaction with a keyboard and screen reader where behavior changes; use the existing accessibility
  tests for regressions.

## Storybook and verification

Storybook is the executable component catalog. `Foundations/Tokens` explains colors, typography, space,
layers and motion. Primitive/pattern pages expose prop controls and state examples; `ComponentGallery`
exercises composed controls and form validation. Documentation and preview canvases share the dark theme.
The supported default is dark; a consumer theme override needs its own state and contrast verification.

Install Chromium once after installing dependencies:

```sh
pnpm --filter @jae-labs/ui exec playwright install chromium
```

Linux CI uses `--with-deps` to install browser system libraries. Follow the repository
[required verification contract](../../AGENTS.md#required-verification) for UI changes. Its commands run
from the repository root; build the catalog before visual tests.

`npm run test:ui` runs every story in headless Chromium, its interaction assertions and blocking axe checks
for WCAG A/AA rules. UI browser coverage has independent minimums: statements/lines 75%, branches 60%,
functions 70%. Application, UI unit and UI browser tests use Vitest 5 with separate configurations for
application jsdom, package jsdom and real-browser execution. Keep Vitest and its browser, coverage and UI
packages on matching versions. `npm run typecheck` also checks package source, stories and test configuration.

Visual tests require Docker and a built catalog. The root visual command uses the checksum-pinned Linux
Playwright image in `scripts/test-ui-visual.mjs`, including a fixed browser/font environment. Desktop and
320px-wide screenshots cover composed controls, forms, dialogs, sheets and tooltips. The suite also verifies
native slider keyboard behavior, reduced-motion CSS and documentation canvases. CI runs all these checks
on direct pushes to main and optional pull requests.

For an intentional visual change, run `npm run test:ui:visual:update`, inspect the changed PNGs under
`packages/ui/tests/visual/linux/`, and commit only reviewed fixtures. Never regenerate snapshots to hide an
unexplained failure. Build output, coverage and test failure output stay ignored. The package-level
`test:visual` command runs the host browser for diagnosis; the root command owns canonical Linux baselines.

Automated axe checks do not establish full WCAG conformance. Review focus order, zoom, touch, long/localized
content, forced colors and screen-reader announcements when relevant behavior changes. Native semantics and
blocking automated tests support that review; they do not replace it.

## Motion and shortcut hints

Neutral charcoal surfaces, a flat persistent selection and indigo primary actions
keep everyday navigation quieter than keyboard focus. Text selection has a separate
semantic token so it does not inherit the row-selection background. Inter Variable
remains the application font; use medium control/title weights and semibold metrics.

Use `ds-motion-control` for transitions of color, opacity and transforms: 160 ms with
`--ds-motion-ease`. Use `ds-content-enter` for a 220 ms opacity-only reveal when content
arrives. Do not animate dimensions, delay data display artificially, or retain stale
private content for a crossfade. Sheets default to a short 8 px entrance with matching opacity; `motion="slide"` uses a full-width entrance from the selected side.
All shared motion helpers also disable animation in reduced-motion mode without relying
on the consumer's CSS. Static loading skeletons avoid continuous shimmer/spinner motion.

`Tooltip` accepts one accessible control, a consumer-owned `label`, an optional
`shortcut`, and `side="right"` or `side="bottom"`. Hints open after 350 ms of pointer
hover, immediately on keyboard focus, and close on blur, activation or Escape. The
existing control description is preserved. The small keycap uses its own tighter radius.
Hints contain no links or controls and are supplementary to an accessible control name.
Do not add instructions to data-chart tooltips.

### Dashboard widget cards

Use `WidgetCard` for chart and dashboard panels with a heading. It owns the shared
24px padding (28px on large screens), 16px content gap, and bold 20px h3 title.
The heading reserves space for a contextual control in the top-right corner;
long titles wrap without overlapping it. Chart dimensions, controls, legends and
application interactions remain consumer content. Put legends below their charts.
Do not override its normal padding or heading typography in route components.
Use plain `Card` for metric cards, forms and surfaces with different content hierarchy.
