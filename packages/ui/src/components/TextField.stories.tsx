import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from './TextField';

const meta = {
  title: 'Primitives/TextField',
  component: TextField,
  tags: ['autodocs'],
  args: { 'aria-label': 'Email address', placeholder: 'name@example.com', className: 'w-72' },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Focused: Story = { args: { autoFocus: true } };
export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'invalid address' } };
export const Disabled: Story = { args: { disabled: true } };
export const Compact: Story = { args: { density: 'compact' } };
export const HelperText: Story = {
  render: (args) => (
    <div className="w-72 space-y-1.5">
      <label htmlFor="email-story" className="text-sm text-ds-text-secondary">Email address</label>
      <TextField {...args} id="email-story" aria-describedby="email-hint" className="" />
      <p id="email-hint" className="text-xs text-ds-text-muted">Use an address you can access.</p>
    </div>
  ),
};
