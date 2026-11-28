import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Range } from './Range';

const meta = {
  title: 'Primitives/Range',
  component: Range,
  parameters: { docs: { description: { component: 'Native keyboard-operable slider. Supply a name and meaningful min/max/step; expose formatted values with aria-valuetext when numbers alone are insufficient.' } } },
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

export const Keyboard: Story = { args: { defaultValue: 50, step: 5 }, play: async ({ canvasElement }) => {
  const slider = within(canvasElement).getByRole('slider');
  await userEvent.tab();
  await expect(slider).toHaveFocus();
  await expect(slider).toHaveAttribute('step', '5');
} };
