import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './Dialog';

const meta = {
  title: 'Primitives/Dialog',
  component: Dialog,
  tags: ['autodocs'],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
      <DialogContent closeLabel="Close dialog" aria-describedby="dialog-description">
        <h2 className="text-lg font-semibold text-ds-text-primary">Review changes</h2>
        <p id="dialog-description" className="mt-2 text-sm text-ds-text-secondary">Confirm the details before continuing.</p>
        <DialogClose asChild><Button variant="secondary" className="mt-5">Cancel</Button></DialogClose>
      </DialogContent>
    </Dialog>
  ),
};
