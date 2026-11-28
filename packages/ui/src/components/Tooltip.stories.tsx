import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Tooltip } from './Tooltip';
import { Button } from './Button';

const meta = { title: 'Components/Tooltip', component: Tooltip,
  tags: ['autodocs'],
  argTypes: { side: { control: 'select', options: ['bottom', 'right'] } },
  parameters: { docs: { description: { component: 'Supplementary hint for one named control. Opens on focus or delayed pointer hover; Escape and activation dismiss it. Tooltip content is noninteractive.' } } },
  args: { label: 'Open details', shortcut: 'F', children: <Button variant="secondary">Details</Button> },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Sidebar: Story = { args: { side: 'right', label: 'Go to projects', shortcut: '1' } };

export const Keyboard: Story = { play: async ({ canvasElement }) => {
  const button = within(canvasElement).getByRole('button', { name: 'Details' });
  await userEvent.tab();
  await expect(button).toHaveFocus();
  const body = within(canvasElement.ownerDocument.body);
  await waitFor(() => expect(body.getByRole('tooltip')).toBeVisible());
  await userEvent.keyboard('{Enter}');
  await expect(body.queryByRole('tooltip')).not.toBeInTheDocument();
} };
export const LongHint: Story = { args: { label: 'Inspect the complete details and supporting information for the selected item.' } };
