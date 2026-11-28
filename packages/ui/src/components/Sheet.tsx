import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '../utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 ds-layer-overlay ds-sheet-overlay bg-ds-canvas/60 backdrop-blur-xs', className)} {...props} />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

export type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: 'right' | 'left';
  motion?: 'subtle' | 'slide';
} & ({ hideCloseButton?: false; closeLabel: string } | { hideCloseButton: true; closeLabel?: never });

const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(({ side = 'right', motion = 'subtle', hideCloseButton = false, closeLabel, className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content ref={ref} data-side={side} data-motion={motion} className={cn('fixed inset-y-0 ds-layer-overlay flex h-full w-full max-w-xl flex-col border-ds-border bg-ds-surface p-6 shadow-ds-overlay ds-sheet-content', side === 'right' && 'right-0 border-l sm:max-w-xl', side === 'left' && 'left-0 border-r sm:max-w-xl', className)} {...props}>
      {children}
      {!hideCloseButton && <DialogPrimitive.Close aria-label={closeLabel} className="absolute right-4 top-4 rounded-ds-control p-1.5 text-ds-text-muted ds-motion-control hover:bg-ds-hover hover:text-ds-text-primary ds-focus-ring"><X aria-hidden="true" className="size-4" /></DialogPrimitive.Close>}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
