# Accessibility and compatibility

JobPulse targets WCAG 2.1 AA across desktop and mobile.

- Use native controls or accessible Radix/cmdk primitives, with visible `ds-focus-ring` focus states.
- Keep all controls keyboard operable with first-class keyboard navigation:
  - `j` / `ArrowDown`: Move selection to the next job opportunity in list or fullscreen view.
  - `k` / `ArrowUp`: Move selection to the previous job opportunity in list or fullscreen view.
  - `Enter` / `Space`: Open and inspect the selected job opportunity.
  - `f`: Toggle fullscreen job inspection mode.
  - `ArrowLeft` / `ArrowRight`: Advance or rewind job pipeline status (`new` ↔ `interested` ↔ `applied` ↔ `interviewing`).
  - `Escape`: Close detail inspection sheet/drawer or dismiss modals.
  - `Cmd+K` / `Ctrl+K`: Global command palette.
- Maintain 4.5:1 text contrast and 3:1 contrast for large text and control boundaries.
- Respect `prefers-reduced-motion`; give interactive chart targets names, focus states, and keyboard activation.
- Test layouts down to 320px and current and prior Chrome, Edge, Firefox, and Safari releases, including mobile browsers.

The interface supports English and Brazilian Portuguese. Keep translation keys aligned and use `formatDate` and `formatNumber` for locale-aware output. The selected language is stored as `jobpulse_lng`.

Run `npm run check` and `npm run build-storybook` before release.
