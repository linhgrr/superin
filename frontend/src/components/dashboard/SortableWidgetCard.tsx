/**
 * SortableWidgetCard — drag-drop wrapper for dashboard widgets.
 *
 * - Uses `@dnd-kit/sortable` to make each widget reorderable.
 * - Shows drag handle + remove button only when `isEditMode` is true.
 * - When dragging, the card fades to opacity 0.5.
 *
 * Usage:
 *   <SortableWidgetCard
 *     widgetId="finance.total-balance"
 *     isEditMode={isEditMode}
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
  isEditMode: boolean;
  onRemove: (widgetId: string) => void;
  children: React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SortableWidgetCard({
  widgetId,
  isEditMode,
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
      {/* Controls — only visible in edit mode */}
      {isEditMode && (
        <div className="sortable-widget-header">
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
        </div>
      )}

      {/* Widget content */}
      <div className="widget-card">{children}</div>
    </div>
  );
}
