# Design review: JobPulse and Linear

Comparison based on the supplied October 3, 2026 screenshots, the current JobPulse
components and Linear's [March 2026 interface refresh](https://linear.app/now/behind-the-latest-design-refresh).
The screenshots establish visual differences; they do not establish Linear's exact
font family, private tokens or animation timings.

| Area | Observation | JobPulse refinement |
| --- | --- | --- |
| Surfaces | Linear's screenshot uses neutral charcoal; JobPulse panels lean blue and its outer canvas is pure black. | Warm neutral canvas/surface/panel/control tokens with restrained separation. |
| Highlighting | JobPulse's active navigation and hover use the same surface, with an additional selection border/shadow. | A flatter persistent selected surface, a quieter hover surface, and a separate accent focus treatment. |
| Primary actions | Linear's example reserves indigo for its main action. JobPulse's default primary button is white. | Indigo action tokens; secondary controls remain neutral. |
| Typography | JobPulse already loads Inter Variable; its heavier metrics and labels make the overall rhythm feel different. | Keep the font, enable optical sizing, soften title/control weights, use semibold metrics and slightly tighter body spacing. |
| Shortcuts | JobPulse shows numeric badges continuously and uses native title tooltips for some controls. | Reusable delayed hints with keycaps on navigation, job cards, expand and close controls. Numeric badges recede until hover/focus. |
| Detail loading | A spinner and abruptly inserted description interrupt the reading panel. | A static accessible skeleton, followed by an opacity-only reveal. New selections reset the reading position without retaining old text. |
| Motion | Interaction durations are scattered and several animation utility names have no corresponding animation implementation. | Shared 160 ms control motion, 220 ms content reveal and explicit sheet animations; reduced-motion support in the package itself. |

These are JobPulse design choices informed by the comparison, not extracted Linear
values. Linear's article explicitly describes a warmer gray palette, dimmer sidebar,
more restrained borders and reduced competing visual weight.

[Linear Peek](https://linear.app/docs/peek) is a distinct Space-key preview interaction.
This pass improves hints and transitions around JobPulse's existing Enter/Space/F/Escape
inspection behavior; it does not introduce hold-to-peek or change Space's fullscreen
reading behavior. No description requests are introduced on hover.

Chart colors remain categorical and retain their domain meaning. The large chart/card
layout and colorful domain legend are still a visual difference from the quieter Linear
example; this pass focuses on the shared theme and interaction system.

## Verification

Shared tooltip tests cover delayed opening, focus access, Escape dismissal, cancellation
and preservation of an existing control description. Inspector tests cover loading,
arrival of the new specification and removal of the previous text. Existing keyboard,
saved-action and tenant-switch tests remain in place. Storybook uses the same locally
loaded Inter Variable font as the app, with a dedicated tooltip story for inspection.
