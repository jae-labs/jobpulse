import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '../utils';

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({ className, ...props }, ref) => <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-ds-canvas/65 backdrop-blur-xl data-[state=closed]:animate-out data-[state=open]:animate-in', className)} {...props} />);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { closeLabel?: string };
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(({ className, children, closeLabel, ...props }, ref) => <DialogPortal><DialogOverlay /><DialogPrimitive.Content ref={ref} className={cn('fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--ds-radius-card)] border border-ds-border-strong bg-ds-panel p-6 text-sm shadow-[var(--ds-shadow-overlay)] sm:p-8', className)} {...props}>{children}<DialogPrimitive.Close aria-label={closeLabel} className="absolute right-4 top-4 rounded-[var(--ds-radius-control)] p-2 text-ds-text-muted transition-colors hover:bg-ds-hover hover:text-ds-text-primary ds-focus-ring"><X className="size-4" /><span className="sr-only">{closeLabel}</span></DialogPrimitive.Close></DialogPrimitive.Content></DialogPortal>);
DialogContent.displayName = DialogPrimitive.Content.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogContent };
