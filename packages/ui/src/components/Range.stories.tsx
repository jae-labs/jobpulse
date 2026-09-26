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
