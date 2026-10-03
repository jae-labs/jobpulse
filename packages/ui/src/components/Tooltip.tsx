import * as React from 'react';
import { cn } from '../utils';

export interface TooltipProps {
  children: React.ReactElement<{ 'aria-describedby'?: string }>;
  label: string;
  shortcut?: string;
  side?: 'right' | 'bottom';
  className?: string;
}

/** Noninteractive hints: delayed on pointer hover, immediate on focus, dismissible with Escape. */
export function Tooltip({ children, label, shortcut, side = 'bottom', className }: TooltipProps) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const focused = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  React.useEffect(() => clearTimer, [clearTimer]);
  React.useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearTimer();
        setOpen(false);
        // A tooltip dismiss must not also close the containing inspector/dialog.
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [open, clearTimer]);
  const close = () => { clearTimer(); setOpen(false); };
  return <span className={cn('ds-tooltip-anchor', className)}
    onPointerEnter={(event) => {
      if (event.pointerType === 'touch') return;
      clearTimer();
      timer.current = setTimeout(() => setOpen(true), 350);
    }}
    onPointerLeave={() => { clearTimer(); if (!focused.current) timer.current = setTimeout(() => setOpen(false), 100); }}
    onFocus={() => { focused.current = true; clearTimer(); setOpen(true); }}
    onBlur={() => { focused.current = false; close(); }} onPointerDown={close}>
    {React.cloneElement(children, { 'aria-describedby': open ? [children.props['aria-describedby'], id].filter(Boolean).join(' ') : children.props['aria-describedby'] })}
    {open && <span id={id} role="tooltip" className="ds-tooltip" data-side={side}>
      <span>{label}</span>{shortcut && <kbd className="ds-shortcut">{shortcut}</kbd>}
    </span>}
  </span>;
}
