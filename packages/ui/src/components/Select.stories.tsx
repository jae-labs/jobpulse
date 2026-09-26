import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select';

const options = <><option value="">Choose an option</option><option value="one">First option</option><option value="two">Second option</option></>;

const meta = {
  title: 'Primitives/Select',
  component: Select,
  tags: ['autodocs'],
  args: { 'aria-label': 'Example choice', children: options, containerClassName: 'w-72' },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Focused: Story = { args: { autoFocus: true } };
export const Invalid: Story = { args: { 'aria-invalid': true } };
export const Disabled: Story = { args: { disabled: true } };
export const Compact: Story = { args: { density: 'compact' } };
