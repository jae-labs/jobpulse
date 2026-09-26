# Instructions for UI Package Agents

These instructions apply to `packages/ui/`. Read [DESIGN.md](DESIGN.md) before changing package components or
tokens. The repository [AGENTS.md](../../AGENTS.md) and its required verification gate also apply.

## Before editing

1. Search `src/components/` and `src/index.ts` for an existing component.
2. Search `src/tokens.css` for an existing semantic token and Tailwind mapping.
3. Decide whether the request belongs in the package or in an application. Prefer composing existing
   primitives over adding another one.
4. Check the relevant app use sites before changing a public prop, token, or exported name.

## Boundaries

- Keep the package product-neutral. Never import application code, JobPulse domain models or types, Supabase,
  routes, application hooks or libraries, translation hooks, or feature components.
- Keep application copy and status meanings in the application. Accept generic content through props and React nodes.
- Import package components through local modules internally. Export intended public APIs from `src/index.ts`;
  applications import from `@jae-labs/ui`.
- Do not duplicate an existing component or add JobPulse-specific behavior. Keep tone and state APIs generic;
  map domain status to `Pill.tone` in the application.

## Styling

- Use semantic `--ds-*` tokens and their named Tailwind utilities. Do not use raw hex, RGB, or HSL colors in
  component source. Literal theme definitions belong only in `src/tokens.css`.
- Do not bypass an appropriate token with raw palette classes or arbitrary Tailwind colors.
- Do not introduce arbitrary spacing, border radius, or shadow values without a documented reason. Reuse the
  established scale and component tokens first.
- Keep normal component appearance in semantic props and package styles. Use `className` for consumer layout
  needs, not routine visual restyling.
- Preserve hover, focus, active, disabled, and responsive behavior. Check contrast and reduced-motion behavior
  when visuals change.
- For charts or tooltips, show data and useful context without repeated “Click to view” instructions.
  Preserve the target's pointer, focus, accessible name, and keyboard behavior when removing hint text.

## After editing

From the repository root, run `npm run check`. This includes lint, `scripts/check-design-system-boundary.sh`,
token validation, typecheck, tests, and build. Run `npm run build-storybook` when component states change;
CI builds Storybook on every change. Run the relevant accessibility checks when interaction or focus behavior
changes. Report any verification that could not run.
