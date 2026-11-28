import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Foundations/Tokens',
  parameters: {
    layout: 'padded',
    docs: { description: { component: 'Semantic tokens are the theme contract. Override them at a theme root, then verify text/control contrast, keyboard focus and every state. Surfaces and decorative hairlines have separate roles from control boundaries. Spacing uses the shared Tailwind scale; type uses Inter Variable. The default theme is dark.' } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const colors = ['canvas', 'surface', 'panel', 'control', 'hover', 'selected', 'accent', 'positive', 'negative', 'warning'] as const;
export const Colors: Story = { render: () => <section aria-label="Semantic colors" className="grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
  {colors.map((token) => <div key={token} className="space-y-2">
    <div aria-hidden="true" className="h-16 rounded-ds-control border border-ds-border-strong" style={{ background: `var(--ds-color-${token})` }} />
    <p className="text-sm text-ds-text-primary">{token}</p>
  </div>)}
</section> };
export const Typography: Story = { render: () => <section aria-label="Typography hierarchy" className="max-w-xl space-y-4">
  <h1 className="text-2xl font-medium">Page title · 24px</h1>
  <h2 className="text-xl font-medium">Section title · 20px</h2>
  <p className="text-sm text-ds-text-primary">Body · 14px · useful information before decoration.</p>
  <p className="text-sm text-ds-text-secondary">Supporting content uses secondary text.</p>
  <p className="text-xs text-ds-text-muted">Caption · 12px · muted text remains readable.</p>
  <p className="font-mono text-sm tabular-nums">Tabular values: 1,500 · 250 · 100</p>
</section> };
export const LayoutAndMotion: Story = { render: () => <section aria-label="Layout and motion rules" className="max-w-xl space-y-4 text-sm">
  <h1 className="text-xl font-medium">Space, layers and motion</h1>
  <p>Use the shared spacing scale. Field gaps use --ds-space-field-gap and native control height uses --ds-control-height.</p>
  <p>Control radius: --ds-radius-control. Surface radius: --ds-radius-card. Reserve elevation for floating overlays.</p>
  <p>Overlays use --ds-layer-overlay; supplementary tooltips use --ds-layer-tooltip.</p>
  <p>Control transitions use --ds-motion-fast; entrances use --ds-motion-enter. Reduced motion disables shared animation and transition helpers.</p>
</section> };
