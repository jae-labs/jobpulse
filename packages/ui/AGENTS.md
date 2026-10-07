# Instructions for UI Package Agents

These instructions apply to `packages/ui/`. Read [DESIGN.md](DESIGN.md) before changing package components or
tokens. The repository [AGENTS.md](../../AGENTS.md) and its required verification gate also apply.

## Before editing

1. Search [src/components/](src/components/) and [src/index.ts](src/index.ts) for an existing component.
2. Search [src/tokens.css](src/tokens.css) for an existing semantic token and Tailwind mapping.
3. Decide whether the request belongs in the package or in an application. Prefer composing existing
   primitives over adding another one.
4. Check the relevant app use sites before changing a public prop, token, or exported name.

## Boundaries

- Keep the package product-neutral. Never import application code, JobPulse domain models or types, Supabase,
  routes, application hooks or libraries, translation hooks, or feature components.
- Keep application copy and status meanings in the application. Accept generic content through props and React nodes.
- Import package components through local modules internally. Export intended public APIs from [src/index.ts](src/index.ts);
  applications import from `@jae-labs/ui`.
- Do not duplicate an existing component or add JobPulse-specific behavior. Keep tone and state APIs generic;
  map domain status to `Pill.tone` in the application.

## Styling

- Use semantic `--ds-*` tokens and their named Tailwind utilities. Do not use raw hex, RGB, or HSL colors in
  component source. Literal theme definitions belong only in [src/tokens.css](src/tokens.css).
- Do not bypass an appropriate token with raw palette classes or arbitrary Tailwind colors.
- Do not introduce arbitrary spacing, border radius, or shadow values without a documented reason. Reuse the
  established scale and component tokens first.
- Keep normal component appearance in semantic props and package styles. Use `className` for consumer layout
  needs, not routine visual restyling.
- Preserve hover, focus, active, disabled, and responsive behavior. Check contrast and reduced-motion behavior
  when visuals change.
- For charts or tooltips, show data and useful context without repeated “Click to view” instructions.
  Preserve the target's pointer, focus, accessible name, and keyboard behavior when removing hint text.

## Stories and regression evidence

- Use Vitest 5 for application, UI unit and UI browser tests. Keep its browser, coverage and UI packages on
  matching versions; use Storybook addons that support the installed Vitest major.

- Every public primitive needs prop documentation, representative variants and applicable disabled, invalid,
  read-only, long-content and responsive states. Use the closest existing story page.
- Add meaningful `play` assertions for changed interaction behavior. Use real browser keyboard input for
  native browser actions; synthetic events do not establish native slider behavior.
- Keep `a11y.test` set to `error`. Do not disable rules, turn failures into todos or lower coverage thresholds
  to pass a change. Check an issue's actual semantics and contrast.
- Keep form controls visibly labelled and errors associated through `Field`. Overlays need names,
  keyboard dismissal, trapped focus and focus return. Required close-label types protect the built-in controls.
- Keep the standalone catalog product-neutral and current. Do not add historical narratives, author names,
  dates, previous PRs/commits or approval anecdotes to docs, stories or explanatory comments.

## After editing

Follow the repository [required verification contract](../../AGENTS.md#required-verification), including
its UI-specific gates. Run its commands from the repository root.
Story tests enforce interaction assertions, blocking axe checks and independent UI coverage thresholds.
Visual tests use the pinned Linux rendering environment; build Storybook first and ensure Docker is available.

Update canonical visual fixtures only for an intentional change with `npm run test:ui:visual:update`.
Inspect every changed PNG before retaining it. Keep browser versions and the pinned image synchronized.
Report checks that could not run and manual accessibility review still needed. Do not claim full accessibility
conformance or hosted production readiness from a green catalog.
