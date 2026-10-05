import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SortableWidget } from './SortableWidget';

const drag = vi.hoisted(() => ({ active: false }));
vi.mock('@dnd-kit/sortable', () => ({ useSortable: () => ({
  attributes: {}, listeners: {}, setNodeRef: vi.fn(), setActivatorNodeRef: vi.fn(),
  transform: { x: 30, y: 40, scaleX: 4, scaleY: 3 }, transition: undefined, isDragging: drag.active,
}) }));

describe('SortableWidget', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    drag.active = false;
    vi.stubGlobal('ResizeObserver', class {
      observe() {} disconnect() {}
    });
  });
  it('keeps the dragged widget dimensions instead of scaling to the larger target', () => {
    drag.active = true;
    render(<SortableWidget id="small" className="" reorderLabel="Reorder Small" resizeLabel="Resize Small"
      resizeInstructions="Resize instructions" minHeight={100} size={{ columns: 4, height: 110 }} onResize={vi.fn()}><div>Small</div></SortableWidget>);
    const widget = screen.getByText('Small').closest('section')!;
    expect(widget.style.transform).toBe('translate3d(30px, 40px, 0)');
    expect(widget.style.height).toBe('110px');
    expect(widget.style.getPropertyValue('--widget-columns')).toBe('4');
    expect(screen.getByRole('button', { name: 'Resize Small' })).toBeDisabled();
  });
  it('resizes with keyboard controls and restores the original default size', () => {
    const resize = vi.fn();
    render(<SortableWidget id="small" className="" reorderLabel="Reorder Small" resizeLabel="Resize Small"
      resizeInstructions="Resize instructions" minHeight={100} size={{ columns: 4, height: 110 }} onResize={resize}><div>Small</div></SortableWidget>);
    const handle = screen.getByRole('button', { name: 'Resize Small' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(resize).toHaveBeenLastCalledWith('small', { columns: 5, height: 110 });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(resize).toHaveBeenLastCalledWith('small', { columns: 4, height: 100 });
    resize.mockClear();
    fireEvent.click(handle, { detail: 0 });
    fireEvent.click(handle, { detail: 1 });
    expect(resize).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(resize).toHaveBeenLastCalledWith('small', undefined);
  });

  it('allows returning to the original height even when it falls between grid steps', () => {
    const resize = vi.fn();
    render(<SortableWidget id="small" className="" reorderLabel="Reorder Small" resizeLabel="Resize Small"
      resizeInstructions="Resize instructions" minHeight={104} size={{ columns: 4, height: 120 }} onResize={resize}><div>Small</div></SortableWidget>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize Small' }), { key: 'ArrowUp' });
    expect(resize).toHaveBeenLastCalledWith('small', { columns: 4, height: 104 });
  });

  it('snaps mobile widths to half/full rows and heights to complete grid rows', () => {
    const resize = vi.fn();
    render(<SortableWidget id="small" viewport="mobile" className="" reorderLabel="Reorder Small" resizeLabel="Resize Small"
      resizeInstructions="Resize instructions" minHeight={148} size={{ columns: 10, height: 148 }} onResize={resize}><div>Small</div></SortableWidget>);
    const handle = screen.getByRole('button', { name: 'Resize Small' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(resize).toHaveBeenLastCalledWith('small', { columns: 20, height: 148 });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(resize).toHaveBeenLastCalledWith('small', { columns: 10, height: 188 });
    const widget = screen.getByText('Small').closest('section')!;
    expect(widget.style.height).toBe('');
    expect(widget.style.getPropertyValue('--widget-rows')).toBe('4');
  });

  it('commits a pointer resize once and discards cancelled changes', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback([{ target, contentRect: { width: target.tagName === 'SECTION' ? 187.2 : 1000, height: 110 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    });
    const resize = vi.fn();
    render(<SortableWidget id="small" className="" reorderLabel="Reorder Small" resizeLabel="Resize Small"
      resizeInstructions="Resize instructions" minHeight={100} size={{ columns: 4, height: 110 }} onResize={resize}><div>Small</div></SortableWidget>);
    const handle = screen.getByRole('button', { name: 'Resize Small' });
    handle.setPointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(handle, { clientX: 200, clientY: 100 });
    fireEvent.click(handle, { detail: 1 });
    expect(resize).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 180 });
    expect(resize).not.toHaveBeenCalled();
    fireEvent.pointerCancel(handle);
    expect(resize).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { button: 0, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 180 });
    fireEvent.pointerUp(handle, { clientX: 300, clientY: 180 });
    expect(resize).toHaveBeenCalledExactlyOnceWith('small', { columns: 6, height: 200 });
  });

});
