import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Field } from './Field';
import { TextField } from './TextField';
const meta = {
  title: 'Patterns/Field', component: Field,
  args: { label: 'Email address', description: 'Use an address you can access.', children: (props) => <TextField {...props} type="email" placeholder="name@example.com" /> },
  decorators: [(Story) => <div className="w-full max-w-sm"><Story /></div>],
  parameters: { docs: { description: { component: 'A visible label and connected help/error text for one native control. Render the control with the supplied props. Application code owns validation and localized content.' } } },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Required: Story = { args: { required: true } };
export const Invalid: Story = { args: { error: 'Enter a valid email address.' } };
export const ReadOnly: Story = { args: { children: (props) => <TextField {...props} readOnly value="reader@example.com" /> } };
export const LongLabel: Story = { args: { label: 'Contact address for messages about this account and its settings' } };
export const Editing: Story = { play: async ({ canvasElement }) => {
  const control = within(canvasElement).getByRole('textbox', { name: 'Email address' });
  await userEvent.type(control, 'reader@example.com');
  await expect(control).toHaveValue('reader@example.com');
  await expect(control).toHaveAccessibleDescription('Use an address you can access.');
} };
