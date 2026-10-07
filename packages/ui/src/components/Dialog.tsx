import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 ds-layer-overlay ds-content-enter bg-ds-canvas/65 backdrop-blur-sm', className)} {...props} />,
);
DialogOverlay.displayName = 'DialogOverlay';

export type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** Localized accessible name for the visible close control. */
  closeLabel: string;
  size?: 'default' | 'wide';
};

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, closeLabel, size = 'default', ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content ref={ref} className={cn(
        'fixed left-1/2 top-1/2 ds-layer-overlay max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-ds-card border border-ds-border-strong bg-ds-panel p-6 text-sm shadow-ds-overlay sm:p-8',
        size === 'wide' ? 'max-w-2xl' : 'max-w-md', className,
      )} {...props}>
        {children}
        <DialogPrimitive.Close aria-label={closeLabel} className="absolute right-4 top-4 rounded-ds-control p-2 text-ds-text-muted ds-motion-control hover:bg-ds-hover hover:text-ds-text-primary ds-focus-ring">
          <X aria-hidden="true" className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = 'DialogContent';

export { Dialog, DialogTrigger, DialogClose, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription };
