import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import { cn } from '../../lib/utils';

interface SortableWidgetProps {
  id: string;
  label: string;
  className: string;
  children: React.ReactNode;
}

export const SortableWidget: React.FC<SortableWidgetProps> = ({
  id,
  label,
  className,
  children,
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

  return (
    <section
      ref={setNodeRef}
      data-widget-id={id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('group relative min-w-0', className, isDragging && 'z-20 opacity-50')}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder ${label}`}
        className="absolute right-4 top-4 z-10 flex size-8 cursor-grab items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-400 opacity-0 transition-opacity hover:text-zinc-200 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50 active:cursor-grabbing group-hover:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </section>
  );
};
