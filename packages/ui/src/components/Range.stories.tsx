import type { Meta, StoryObj } from '@storybook/react-vite';
import { Range } from './Range';

const meta = {
  title: 'Primitives/Range',
  component: Range,
  tags: ['autodocs'],
  args: { 'aria-label': 'Level', defaultValue: 50, className: 'w-72' },
} satisfies Meta<typeof Range>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };

export const Minimum: Story = { args: { defaultValue: 0 } };
export const Maximum: Story = { args: { defaultValue: 100 } };
export const Stepped: Story = { args: { min: 0, max: 100, step: 5, defaultValue: 75 } };

export const Compact: Story = { args: { density: 'compact' } };
