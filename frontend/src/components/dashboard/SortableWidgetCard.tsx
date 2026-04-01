/**
 * SortableWidgetCard — drag-drop wrapper for dashboard widgets.
 *
 * - Uses `@dnd-kit/sortable` to make each widget reorderable.
 * - Shows drag handle + remove button in edit mode.
 * - When dragging, the card is marked with the `is-dragging` class.
 * - Applies `widget-{size}` class so the 12-column grid respects widget size.
 *
 * Usage:
 *   <SortableWidgetCard
 *     widgetId="finance.total-balance"
 *     widgetSize="medium"
 *     color="oklch(0.70 0.18 250)"
 *     onRemove={handleRemove}
 *   >
 *     <WidgetContent />
 *   </SortableWidgetCard>
 */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { WidgetManifestSchema } from "@/types/generated/api";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SortableWidgetCardProps {
  widgetId: string;
  widgetSize: WidgetManifestSchema["size"];
  color?: string | null;
  onRemove: (widgetId: string) => void;
  children: React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SortableWidgetCard({
  widgetId,
  widgetSize,
  color,
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

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`sortable-widget widget-${widgetSize}${isDragging ? " is-dragging" : ""}`}
    >
      {/* Edit-mode controls: absolutely positioned over the card */}
      <div className="sortable-widget-controls">
        <button
          type="button"
          className="drag-handle"
          aria-label="Drag to reorder widget"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          className="remove-widget-btn"
          aria-label="Remove widget"
          onClick={() => onRemove(widgetId)}
        >
          <X size={12} />
        </button>
      </div>

      {/* Widget content */}
      <div className="widget-card" style={{ position: "relative" }}>
        {color && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: color,
              borderRadius: "16px 16px 0 0",
              zIndex: 1,
            }}
          />
        )}
        {children}
      </div>
    </div>
  );
}
