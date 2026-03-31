/**
 * SortableWidgetCard — drag-drop wrapper for dashboard widgets.
 *
 * - Uses `@dnd-kit/sortable` to make each widget reorderable.
 * - Always shows drag handle + remove button (only rendered in edit mode).
 * - When dragging, the card is marked with the `is-dragging` class.
 *
 * Usage:
 *   <SortableWidgetCard
 *     widgetId="finance.total-balance"
 *     onRemove={handleRemove}
 *   >
 *     <WidgetContent />
 *   </SortableWidgetCard>
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SortableWidgetCardProps {
  widgetId: string;
  onRemove: (widgetId: string) => void;
  children: React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SortableWidgetCard({
  widgetId,
  onRemove,
  children,
}: SortableWidgetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widgetId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-widget${isDragging ? " is-dragging" : ""}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="drag-handle"
        aria-label="Drag to reorder widget"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      {/* Remove button */}
      <button
        type="button"
        className="remove-widget-btn"
        aria-label="Remove widget"
        onClick={() => onRemove(widgetId)}
      >
        <X size={14} />
      </button>

      {/* Widget content */}
      <div className="widget-card">{children}</div>
    </div>
  );
}
