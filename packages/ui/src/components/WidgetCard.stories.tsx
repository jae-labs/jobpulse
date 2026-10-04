import type { Meta, StoryObj } from '@storybook/react-vite';
import { WidgetCard } from './WidgetCard';

const meta = {
  title: 'Patterns/WidgetCard',
  component: WidgetCard,
  tags: ['autodocs'],
  args: {
    title: 'Dashboard trends',
    className: 'max-w-xl',
    children: <div className="h-60 rounded-ds-control border border-ds-border bg-ds-control" aria-label="Chart content placeholder" />,
  },
} satisfies Meta<typeof WidgetCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LongTitle: Story = { args: { title: 'A longer dashboard heading that wraps consistently', className: 'max-w-sm' } };
