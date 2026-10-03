import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip } from './Tooltip';
import { Button } from './Button';

const meta = { title: 'Components/Tooltip', component: Tooltip,
  args: { label: 'Open details', shortcut: 'F', children: <Button variant="secondary">Details</Button> },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Sidebar: Story = { args: { side: 'right', label: 'Go to projects', shortcut: '1' } };
