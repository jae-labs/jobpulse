import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from './Field';
import { Textarea } from './Textarea';

const meta = {
  title: 'Primitives/Textarea',
  component: Textarea,
  argTypes: { density: { control: 'select', options: ['default', 'compact'] } },
  parameters: { docs: { description: { component: 'Native control with shared focus, disabled and invalid states. Compose Field for connected labels, instructions and validation errors.' } } },
  tags: ['autodocs'],
  args: { 'aria-label': 'Notes', placeholder: 'Add a note…', className: 'w-72' },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Invalid: Story = { render: (args) => <Field label="Notes" error="Review this value.">{(props) => <Textarea {...args} {...props} />}</Field> };
export const Disabled: Story = { args: { disabled: true } };
export const Compact: Story = { args: { density: 'compact' } };

export const ReadOnly: Story = { args: { readOnly: true, defaultValue: 'Read-only content' } };
