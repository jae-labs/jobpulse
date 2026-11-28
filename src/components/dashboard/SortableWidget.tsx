import React, { useCallback, useId } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import { cn } from '@jae-labs/ui';
import { useWidgetResize } from './useWidgetResize';
import { mobileWidgetGap, widgetHeightStep, type WidgetViewport, type WidgetSize } from './widgetSize';

interface SortableWidgetProps {
  id: string;
  className: string;
  children: React.ReactNode;
  reorderLabel: string;
  resizeLabel: string;
  resizeInstructions: string;
  viewport?: WidgetViewport;
  size?: WidgetSize;
  minHeight: number;
  onResize: (id: string, size: WidgetSize | undefined) => void;
}

const SortableWidgetComponent: React.FC<SortableWidgetProps> = ({
  id,
  className,
  children,
  reorderLabel,
  resizeLabel,
  resizeInstructions,
  size,
  viewport = 'desktop',
  minHeight,
  onResize,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const resize = useWidgetResize(id, size, minHeight, onResize, viewport);
  const resizeHelpId = useId();
  const { setResizeNode } = resize;
  const setRef = useCallback((element: HTMLElement | null) => {
    setNodeRef(element);
    setResizeNode(element);
  }, [setNodeRef, setResizeNode]);

  return (
    <section
      ref={setRef}
      data-widget-id={id}
      data-resized={resize.size?.height !== undefined || undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        height: viewport === 'desktop' ? resize.size?.height : undefined,
        minHeight: viewport === 'desktop' && resize.size?.height ? minHeight : undefined,
        ...({ '--widget-columns': resize.size?.columns,
          '--widget-mobile-columns': resize.size ? resize.size.columns >= 20 ? 2 : 1 : undefined,
          '--widget-rows': resize.size?.height === undefined ? undefined : Math.round((resize.size.height + mobileWidgetGap) / widgetHeightStep) } as React.CSSProperties),
        transition: resize.resizing ? undefined : transition,
      }}
      className={cn('overview-widget group relative flex flex-col min-w-0 self-start', className, isDragging && 'z-20 opacity-50')}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={reorderLabel}
        className="absolute right-2 top-2 md:right-4 md:top-4 z-10 flex size-8 touch-none cursor-grab items-center justify-center rounded-ds-control border border-ds-border bg-ds-control/80 text-ds-text-muted opacity-100 [@media(hover:hover)]:opacity-0 ds-motion-control hover:text-ds-text-secondary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent/50 active:cursor-grabbing group-hover:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="widget-content flex flex-1 flex-col min-w-0">{children}</div>
      <span id={resizeHelpId} className="sr-only">{resizeInstructions}</span>
      <button
        type="button"
        aria-label={resizeLabel}
        aria-describedby={resizeHelpId}
        title={resizeInstructions}
        disabled={isDragging}
        className="widget-resize-handle absolute bottom-0 right-0 z-10 size-8 touch-none cursor-nwse-resize rounded-br-ds-card text-ds-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ds-accent/50"
        {...resize.resizeListeners}
      >
        <span aria-hidden="true" className="widget-resize-corner" />
      </button>
    </section>
  );
};

export const SortableWidget = React.memo(SortableWidgetComponent);
