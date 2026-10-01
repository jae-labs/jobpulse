import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { PageHeader } from './PageHeader';

const meta = {
  title: 'Patterns/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
  args: { title: 'Overview', description: 'A concise description of this page.' },
  decorators: [(Story) => <div className="w-[min(90vw,44rem)]"><Story /></div>],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = {
  args: { actions: <Button size="sm">Create item</Button> },
};
