import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';

const meta = {
  title: 'Primitives/Card',
  component: Card,
  tags: ['autodocs'],
  args: { children: 'A quiet surface for related content.', className: 'w-72 p-5' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Panel: Story = {};
export const Control: Story = { args: { variant: 'control' } };
