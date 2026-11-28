import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { snapWidgetHeight, snapMobileWidgetHeight, mobileWidgetGap, widgetHeightStep, type WidgetViewport, type WidgetSize } from './widgetSize';

interface ResizeSession {
  pointerId: number;
  x: number;
  y: number;
  height: number;
  columns: number;
  unit: number;
}

export function useWidgetResize(id: string, size: WidgetSize | undefined, minHeight: number,
  onResize: (id: string, size: WidgetSize | undefined) => void, viewport: WidgetViewport = 'desktop') {
  const node = useRef<HTMLElement | null>(null);
  const measured = useRef({ width: 0, height: 0, gridWidth: 0 });
  const session = useRef<ResizeSession | null>(null);
  const frame = useRef<number | null>(null);
  const nextSize = useRef<WidgetSize | undefined>(undefined);
  const [preview, setPreview] = useState<WidgetSize>();

  const setResizeNode = useCallback((element: HTMLElement | null) => { node.current = element; }, []);
  useEffect(() => {
    const element = node.current;
    const grid = element?.parentElement;
    if (!element || !grid) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === element) {
          measured.current.width = entry.contentRect.width;
          measured.current.height = entry.contentRect.height;
        } else measured.current.gridWidth = entry.contentRect.width;
      }
    });
    observer.observe(element);
    observer.observe(grid);
    return () => { observer.disconnect(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);

  const mobile = viewport === 'mobile';
  const snapHeight = (height: number) => mobile ? snapMobileWidgetHeight(height, minHeight) : snapWidgetHeight(height, minHeight);
  const currentColumns = () => mobile
    ? (size ? size.columns >= 20 ? 20 : 10 : measured.current.width > measured.current.gridWidth * 0.75 ? 20 : 10)
    : Math.max(4, Math.min(20, size?.columns ?? Math.round((measured.current.width + 16) / ((measured.current.gridWidth + 16) / 20))));
  const calculate = (event: PointerEvent<HTMLButtonElement>, start: ResizeSession): WidgetSize => ({
    columns: mobile ? Math.max(10, Math.min(20, start.columns + Math.round((event.clientX - start.x) / start.unit) * 10))
      : Math.max(4, Math.min(20, start.columns + Math.round((event.clientX - start.x) / start.unit))),
    height: snapHeight(start.height + event.clientY - start.y),
  });
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !measured.current.width) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    session.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      height: measured.current.height, columns: currentColumns(),
      unit: mobile ? (measured.current.gridWidth + mobileWidgetGap) / 2 : (measured.current.gridWidth + 16) / 20 };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = session.current;
    if (!start || start.pointerId !== event.pointerId) return;
    nextSize.current = calculate(event, start);
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setPreview(nextSize.current);
    });
  };
  const clearSession = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    session.current = null;
    setPreview(undefined);
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = session.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const moved = Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 4;
    const updated = calculate(event, start);
    clearSession();
    if (moved) onResize(id, updated);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && session.current) { event.preventDefault(); clearSession(); return; }
    if (event.key === 'Home') { event.preventDefault(); onResize(id, undefined); return; }
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    const columns = currentColumns();
    const height = size?.height ?? measured.current.height;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      onResize(id, { ...size, columns: Math.max(mobile ? 10 : 4, Math.min(20, columns + (event.key === 'ArrowRight' ? 1 : -1) * (mobile ? 10 : 1))) });
    } else onResize(id, { columns, height: snapHeight(height + (event.key === 'ArrowDown' ? widgetHeightStep : -widgetHeightStep)) });
  };
  return { setResizeNode, size: preview ?? size, resizing: preview !== undefined,
    resizeListeners: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: clearSession,
      onLostPointerCapture: clearSession, onKeyDown } };
}
