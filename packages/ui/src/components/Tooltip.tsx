import * as React from 'react';
import { createPortal } from 'react-dom';
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
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);
  const focused = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const tooltipRef = React.useRef<HTMLSpanElement>(null);
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
  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tooltipRef.current) return;
    const updatePosition = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!anchor || !tooltip) return;
      const gutter = 8;
      const maxLeft = window.innerWidth - tooltip.width - gutter;
      const preferredLeft = side === 'right' ? anchor.right + gutter : anchor.right - tooltip.width;
      const preferredTop = side === 'right' ? anchor.top + (anchor.height - tooltip.height) / 2 : anchor.bottom + gutter;
      const flippedTop = anchor.top - tooltip.height - gutter;
      setPosition({
        left: Math.max(gutter, Math.min(preferredLeft, maxLeft)),
        top: Math.max(gutter, Math.min(preferredTop + tooltip.height > window.innerHeight ? flippedTop : preferredTop, window.innerHeight - tooltip.height - gutter)),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, side]);
  const close = () => { clearTimer(); setOpen(false); };
  const tooltip = open && typeof document !== 'undefined' ? createPortal(
    <span
      ref={tooltipRef}
      id={id}
      role="tooltip"
      className="ds-tooltip"
      data-side={side}
      data-positioned={position ? 'true' : 'false'}
      style={position ? { left: position.left, top: position.top } : undefined}
      onPointerEnter={clearTimer}
      onPointerLeave={() => { if (!focused.current) timer.current = setTimeout(() => setOpen(false), 100); }}
    >
      <span>{label}</span>{shortcut && <kbd className="ds-shortcut">{shortcut}</kbd>}
    </span>,
    document.body,
  ) : null;
  return <span ref={anchorRef} className={cn('ds-tooltip-anchor', className)}
    onPointerEnter={(event) => {
      if (event.pointerType === 'touch') return;
      clearTimer();
      timer.current = setTimeout(() => setOpen(true), 350);
    }}
    onPointerLeave={() => { clearTimer(); if (!focused.current) timer.current = setTimeout(() => setOpen(false), 100); }}
    onFocus={() => { focused.current = true; clearTimer(); setOpen(true); }}
    onBlur={() => { focused.current = false; close(); }} onPointerDown={close}>
    {React.cloneElement(children, { 'aria-describedby': open ? [children.props['aria-describedby'], id].filter(Boolean).join(' ') : children.props['aria-describedby'] })}
    {tooltip}
  </span>;
}
