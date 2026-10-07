# Accessibility and compatibility

JobPulse targets WCAG 2.1 AA across desktop and mobile.

- Use native controls or accessible Radix/cmdk primitives, with visible `ds-focus-ring` focus states.
- Keep all controls keyboard operable with first-class keyboard navigation:
  - `j` / `ArrowDown`: Move selection to the next job opportunity in list or fullscreen view.
  - `k` / `ArrowUp`: Move selection to the previous job opportunity in list or fullscreen view.
  - `Enter` / `Space`: Open and inspect the selected job opportunity.
  - `f`: Toggle fullscreen job inspection mode.
  - `ArrowLeft` / `ArrowRight`: Advance or rewind job pipeline status (`new` ↔ `applied` ↔ `interviewing` ↔ `rejected`). Archive and Saved remain separate controls.
  - `Escape`: Close detail inspection sheet/drawer or dismiss modals.
  - `Cmd+K` / `Ctrl+K`: Global command palette.
  - Overview resize handles: arrow keys adjust width/height, Home restores the default size, and Escape cancels a pointer resize. Drag handles retain sortable keyboard navigation.
- Maintain 4.5:1 text contrast and 3:1 contrast for large text and control boundaries.
- Respect `prefers-reduced-motion`; give interactive chart targets names, focus states, and keyboard activation.
- Required compatibility target: layouts down to 320px and current and prior Chrome, Edge, Firefox and
  Safari releases, including mobile browsers. This target is a review requirement, not a coverage claim.

## Verification coverage

The automated Storybook suite uses Chromium for interaction and axe accessibility checks. Visual tests
use pinned Linux Chromium at 1280×800 and 320×760, with reduced motion enabled. They cover five component
compositions, native slider keys, dark documentation canvases, reduced-motion styles and control contrast.
See [browser configuration](../packages/ui/vitest.config.ts),
[visual configuration](../packages/ui/playwright.config.ts) and [visual tests](../packages/ui/tests/visual.spec.ts).

Firefox, WebKit, real mobile devices, screen-reader announcements, zoom and forced-color usability need
manual verification; they are not covered by the automated matrix. Review long English/Portuguese content
and actual application journeys when affected. A green Chromium/axe gate does not establish cross-browser
compatibility or full WCAG conformance.

The interface supports English and Brazilian Portuguese. Keep translation keys aligned and use `formatDate` and `formatNumber` for locale-aware output. The selected language is stored as `jobpulse_lng`.

Follow the [required verification contract](../AGENTS.md#required-verification) before completion and release.
Storybook axe violations fail the browser gate. Follow the
[UI verification contract](../packages/ui/DESIGN.md#storybook-and-verification) for visual fixtures and manual
accessibility review; automated checks do not establish full WCAG conformance.
