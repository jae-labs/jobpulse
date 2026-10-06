import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from './Sheet';

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
        <SheetTitle className="text-lg font-semibold">Details</SheetTitle>
        <SheetDescription id="sheet-description" className="mt-2 text-sm text-ds-text-secondary">Supporting information appears here.</SheetDescription>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild><Button variant="secondary">Open from left</Button></SheetTrigger>
      <SheetContent side="left" motion="slide" closeLabel="Close sheet" aria-describedby="left-sheet-description">
        <SheetTitle className="text-lg font-semibold">Navigation</SheetTitle>
        <SheetDescription id="left-sheet-description" className="mt-2 text-sm text-ds-text-secondary">A left-aligned sheet.</SheetDescription>
      </SheetContent>
    </Sheet>
  ),
};
