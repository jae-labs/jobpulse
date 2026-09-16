import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '../utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-ds-canvas/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: 'right' | 'left'; hideCloseButton?: boolean; closeLabel?: string }>(({ side = 'right', hideCloseButton = false, closeLabel, className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content ref={ref} className={cn('fixed inset-y-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-ds-border bg-ds-workspace p-6 shadow-2xl transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300', side === 'right' && 'right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-xl', side === 'left' && 'left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-xl', className)} {...props}>
      {children}
      {!hideCloseButton && <DialogPrimitive.Close aria-label={closeLabel} className="absolute right-4 top-4 rounded-md p-1.5 text-ds-text-muted transition-colors hover:bg-ds-hover hover:text-ds-text-primary ds-focus-ring"><X className="size-4" /><span className="sr-only">{closeLabel}</span></DialogPrimitive.Close>}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent };
