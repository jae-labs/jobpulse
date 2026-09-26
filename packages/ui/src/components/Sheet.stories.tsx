import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Sheet, SheetContent, SheetTrigger } from './Sheet';

const meta = {
  title: 'Primitives/Sheet',
  component: Sheet,
  tags: ['autodocs'],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Right: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild><Button>Open sheet</Button></SheetTrigger>
      <SheetContent closeLabel="Close sheet" aria-describedby="sheet-description">
        <h2 className="text-lg font-semibold">Details</h2>
        <p id="sheet-description" className="mt-2 text-sm text-ds-text-secondary">Supporting information appears here.</p>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild><Button variant="secondary">Open from left</Button></SheetTrigger>
      <SheetContent side="left" closeLabel="Close sheet" aria-describedby="left-sheet-description">
        <h2 className="text-lg font-semibold">Navigation</h2>
        <p id="left-sheet-description" className="mt-2 text-sm text-ds-text-secondary">A left-aligned sheet.</p>
      </SheetContent>
    </Sheet>
  ),
};
