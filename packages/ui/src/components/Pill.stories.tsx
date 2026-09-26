import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill } from './Pill';

const meta = {
  title: 'Primitives/Pill',
  component: Pill,
  tags: ['autodocs'],
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
