import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from './Button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Continue', variant: 'primary', size: 'default', type: 'button' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger', 'quiet', 'dangerQuiet'], description: 'Semantic action emphasis.' },
    size: { control: 'select', options: ['xs', 'sm', 'default', 'lg', 'icon'], description: 'Control size; icon-only controls require an accessible name.' },
    type: { control: 'select', options: ['button', 'submit', 'reset'] },
    disabled: { control: 'boolean' },
  },
  parameters: { docs: { description: { component: 'Use primary for the main action, secondary for supporting actions, and danger for destructive actions. Defaults to button to prevent implicit form submission. asChild preserves child semantics; links do not support native disabled behavior.' } } },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Delete item' } };
export const Quiet: Story = { args: { variant: 'quiet', children: 'Reset filters' } };
export const DangerQuiet: Story = { args: { variant: 'dangerQuiet', children: 'Remove' } };
export const ExtraSmall: Story = { args: { size: 'xs' } };
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = {
  args: {
    disabled: true,
    'aria-busy': true,
    children: <><span className="size-3 rounded-full border border-current border-t-transparent" aria-hidden="true" />Loading…</>,
  },
};

export const Keyboard: Story = {
  args: { onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Continue' });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(button).toHaveAttribute('type', 'button');
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
export const LongLabel: Story = { args: { children: 'Continue to the next configuration step', className: 'max-w-full whitespace-normal h-auto min-h-10 text-center' } };
export const AsLink: Story = { args: { asChild: true, children: <a href="#component-preview">View details</a> } };
