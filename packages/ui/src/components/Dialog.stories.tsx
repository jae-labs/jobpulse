import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Button } from './Button';
import { Dialog, DialogClose, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from './Dialog';

const meta = {
  title: 'Primitives/Dialog', component: DialogContent,
  args: { closeLabel: 'Close dialog' },
  argTypes: { size: { control: 'select', options: ['default', 'wide'] } },
  parameters: { docs: { description: { component: 'Modal task with a required close label. Compose DialogTitle and DialogDescription to name and explain the task. Default width is bounded; wide supports denser content.' } } },
  render: (args) => <Dialog>
    <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
    <DialogContent {...args}>
      <DialogTitle className="pr-8 text-lg font-semibold">Review changes</DialogTitle>
      <DialogDescription className="mt-2 text-sm text-ds-text-secondary">Confirm the details before continuing.</DialogDescription>
      <DialogClose asChild><Button variant="secondary" className="mt-5">Cancel</Button></DialogClose>
    </DialogContent>
  </Dialog>,
} satisfies Meta<typeof DialogContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Wide: Story = { args: { size: 'wide' } };
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Open dialog' });
    await userEvent.click(trigger);
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByRole('dialog', { name: 'Review changes' })).toBeVisible();
    await expect(body.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(body.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
  },
};
export const LongContent: Story = {
  render: (args) => <Dialog defaultOpen>
    <DialogContent {...args}>
      <DialogTitle className="pr-8 text-lg font-semibold">Review all details</DialogTitle>
      <DialogDescription className="mt-2 text-sm text-ds-text-secondary">Scroll to inspect the complete content. Close remains keyboard accessible.</DialogDescription>
      {Array.from({ length: 16 }, (_, index) => <p key={index} className="mt-4 text-sm text-ds-text-secondary">Detail {index + 1}: supporting information for the current task.</p>)}
      <DialogClose asChild><Button variant="secondary" className="mt-5">Cancel</Button></DialogClose>
    </DialogContent>
  </Dialog>,
};
