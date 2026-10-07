import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from './Field';
import { Select } from './Select';

const options = <><option value="">Choose an option</option><option value="one">First option</option><option value="two">Second option</option></>;

const meta = {
  title: 'Primitives/Select',
  component: Select,
  argTypes: { density: { control: 'select', options: ['default', 'compact'] } },
  parameters: { docs: { description: { component: 'Native control with shared focus, disabled and invalid states. Compose Field for connected labels, instructions and validation errors.' } } },
  tags: ['autodocs'],
  args: { 'aria-label': 'Example choice', children: options, containerClassName: 'w-72' },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Focused: Story = { args: { autoFocus: true } };
export const Invalid: Story = { render: (args) => <Field label="Example choice" error="Review this value.">{(props) => <Select {...args} {...props} />}</Field> };
export const Disabled: Story = { args: { disabled: true } };
export const Compact: Story = { args: { density: 'compact' } };
