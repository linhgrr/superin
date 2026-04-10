/**
 * AppListPanel — Step 1 of AddWidgetDialog: select an app from the catalog.
 */

import { memo } from "react";
import type { AppRuntimeEntry } from "@/types/generated";
import { DynamicIcon } from "@/lib/icon-resolver";

interface AppListPanelProps {
  catalog: AppRuntimeEntry[];
  enabledWidgetIds: ReadonlySet<string>;
  onSelectApp: (app: AppRuntimeEntry) => void;
  onClose: () => void;
}

export const AppListPanel = memo(function AppListPanel({ catalog, enabledWidgetIds, onSelectApp, onClose }: AppListPanelProps) {
  return (
    <>
      <div className="dialog-header">
        <span className="dialog-title">Add Widget</span>
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} style={{ marginLeft: "auto" }}>
          <DynamicIcon name="X" size={18} />
        </button>
      </div>

      <div className="dialog-body" style={{ padding: "0.5rem" }}>
        {catalog.length === 0 ? (
          <div className="empty-state" style={{ padding: "2rem 1rem" }}>
            <p style={{ color: "var(--color-foreground-muted)" }}>No apps installed</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {catalog.map((app) => {
              const widgets = app.widgets ?? [];
              const visibleCount = widgets.filter((w) => enabledWidgetIds.has(w.id)).length;

              return (
                <button
                  key={app.id}
                  type="button"
                  className="option-btn"
                  onClick={() => onSelectApp(app)}
                  style={{ padding: "0.875rem 1rem", borderRadius: "12px", transition: "all 0.2s ease" }}
                >
                  <div
                    className="option-icon"
                    style={{
                      background: app.color ? `${app.color}22` : "var(--color-surface-elevated)",
                      color: app.color || "var(--color-foreground-muted)",
                      border: app.color ? `1px solid ${app.color}33` : undefined,
                    }}
                  >
                    {app.icon ? (
                      <DynamicIcon name={app.icon} size={18} strokeWidth={2} />
                    ) : (
                      <DynamicIcon name="LayoutGrid" size={18} strokeWidth={2} />
                    )}
                  </div>

                  <div className="option-info">
                    <div className="option-name">{app.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
                      {visibleCount}/{widgets.length} widgets visible
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
});
