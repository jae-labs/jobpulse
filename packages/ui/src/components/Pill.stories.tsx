import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill, type PillTone } from './Pill';

const meta = {
  title: 'Primitives/Pill',
  component: Pill,
  tags: ['autodocs'],
  parameters: { docs: { description: { component: 'Compact toggle/filter button. aria-pressed exposes selection; tones are generic visual categories. Domain meanings and filter behavior belong to consumers. Disabled controls cannot activate.' } } },
  argTypes: { size: { control: 'select', options: ['sm', 'default'] }, layout: { control: 'select', options: ['inline', 'spread'] } },
  args: { label: 'Filter', count: 12 },
} satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Positive: Story = { args: { tone: 'positive' } };
export const Warning: Story = { args: { tone: 'warning' } };
export const Negative: Story = { args: { tone: 'negative' } };
export const Muted: Story = { args: { tone: 'muted' } };
export const ChartTone: Story = { args: { tone: 'chart-2' } };
export const ActiveNeutral: Story = { args: { tone: 'neutral', active: true, label: 'All' } };
export const Active: Story = { args: { tone: 'data-1', active: true } };
export const Disabled: Story = { args: { tone: 'data-1', disabled: true } };

const tones: PillTone[] = ['neutral', 'muted', 'info', 'positive', 'warning', 'negative', ...Array.from({ length: 16 }, (_, i) => `data-${i + 1}` as PillTone), ...Array.from({ length: 8 }, (_, i) => `chart-${i + 1}` as PillTone)];
export const Palette: Story = { render: () => <section aria-label="Tone states" className="flex max-w-3xl flex-wrap gap-3">{tones.flatMap((tone) => [<Pill key={tone} tone={tone} label={tone} count={12} />, <Pill key={`${tone}-active`} tone={tone} label={tone} count={12} active />])}</section> };
