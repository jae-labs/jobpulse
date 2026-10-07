import type { Meta, StoryObj } from '@storybook/react-vite';
import { Inbox } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Patterns/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: { docs: { description: { component: 'Explain an empty result and provide a meaningful next action when one exists. Consumers distinguish loading, failure and empty states.' } } },
  args: { title: 'Nothing here yet', description: 'Items will appear here when they are available.', className: 'w-80' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithIcon: Story = { args: { icon: Inbox } };
export const WithAction: Story = {
  args: { icon: Inbox, action: <Button size="sm">Add item</Button> },
};
