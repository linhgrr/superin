/**
 * EditModeBar — sticky toolbar shown while in dashboard edit mode.
 *
 * Displays an "Edit Mode" badge with three action buttons:
 *   - Save   → persists all pending widget changes then exits edit mode
 *   - Add Widget → opens the widget picker
 *   - Cancel → discards all pending changes and exits edit mode
 *
 * Props come from the parent (DashboardPage); this component reads
 * `pendingChanges` via `useDashboardEdit()` but does NOT call
 * `enterEditMode` / `exitEditMode` directly.
 */

import { Check, Plus, X } from "lucide-react";
import { useDashboardEdit } from "@/hooks/useDashboardEdit";
import { updatePreferences } from "@/api/catalog";
import type { PreferenceUpdate } from "@/types/generated/api";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface EditModeBarProps {
  /** IDs of all installed apps — used to route preference updates. */
  installedAppIds: ReadonlySet<string>;

  /** Called when the user clicks "Add Widget". */
  onAddWidget: () => void;

  /** Called after a successful save. */
  onSaveSuccess: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the `appId` prefix from a widgetId like "finance.total-balance". */
function appIdFrom(widgetId: string): string {
  const dot = widgetId.indexOf(".");
  return dot === -1 ? widgetId : widgetId.slice(0, dot);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EditModeBar({
  installedAppIds,
  onAddWidget,
  onSaveSuccess,
}: EditModeBarProps) {
  const { pendingChanges, discardChanges } = useDashboardEdit();

  if (!pendingChanges.size) return null;

  async function handleSave() {
    const byApp = new Map<string, PreferenceUpdate[]>();

    for (const [widgetId, change] of pendingChanges) {
      const appId = appIdFrom(widgetId);
      if (!installedAppIds.has(appId)) continue;

      const update: PreferenceUpdate = {
        widget_id: widgetId,
        ...(change.enabled !== undefined ? { enabled: change.enabled } : {}),
        ...(change.position !== undefined ? { position: change.position } : {}),
      };

      const list = byApp.get(appId) ?? [];
      list.push(update);
      byApp.set(appId, list);
    }

    await Promise.all(
      [...byApp].map(([appId, updates]) => updatePreferences(appId, updates))
    );

    discardChanges();
    onSaveSuccess();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="edit-mode-bar" role="toolbar" aria-label="Dashboard edit controls">
      {/* Pill badge */}
      <span className="edit-mode-badge">Edit Mode</span>

      {/* Actions */}
      <div className="edit-mode-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          aria-label="Save changes"
        >
          <Check size={14} />
          Save
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onAddWidget}
          aria-label="Add widget"
        >
          <Plus size={14} />
          Add Widget
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={discardChanges}
          aria-label="Cancel and discard changes"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
