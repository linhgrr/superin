/**
 * AddWidgetDialog — 2-step widget picker.
 *
 * Step 1: pick an installed app
 * Step 2: pick a widget from that app → calls `onAdd(widgetId)`
 *
 * Props:
 *   catalog     — AppCatalogEntry[]  (already filtered for is_installed)
 *   onAdd       — (widgetId: string) => void
 *   onClose     — () => void
 */

import { ArrowLeft, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppCatalogEntry } from "@/types/generated/api";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AddWidgetDialogProps {
  catalog: AppCatalogEntry[];
  onAdd: (widgetId: string) => void;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSizeLabel(size: string): string {
  switch (size) {
    case "small":      return "Small";
    case "medium":     return "Medium";
    case "large":      return "Large";
    case "full-width": return "Full Width";
    default:           return size;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AddWidgetDialog({
  catalog,
  onAdd,
  onClose,
}: AddWidgetDialogProps) {
  const [selectedApp, setSelectedApp] = useState<
    AppCatalogEntry | null
  >(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Trap focus inside panel when open
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // ── Step 1: app list ──────────────────────────────────────────────────────

  if (!selectedApp) {
    return (
      <div className="dialog-backdrop" onClick={onClose}>
        <div
          className="dialog-panel"
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Add Widget"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dialog-header">
            <span className="dialog-title">Add Widget</span>
          </div>

          <div className="dialog-body">
            {catalog.length === 0 ? (
              <p className="empty-message">No apps installed</p>
            ) : (
              catalog.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="app-option-btn"
                  onClick={() => setSelectedApp(app)}
                >
                  {/* App icon — rendered as colored emoji/text block */}
                  <div
                    className="app-option-icon"
                    style={{ background: app.color + "22", color: app.color }}
                  >
                    {app.icon}
                  </div>

                  <div className="app-option-info">
                    <div className="app-option-name">{app.name}</div>
                    <div className="app-option-count">
                      {app.widgets.length}{" "}
                      {app.widgets.length === 1 ? "widget" : "widgets"}
                    </div>
                  </div>

                  <LayoutGrid size={16} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: widget list ───────────────────────────────────────────────────

  const widgets = selectedApp.widgets || [];

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${selectedApp.name} widgets`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.25rem 0.5rem" }}
            onClick={() => setSelectedApp(null)}
            aria-label="Back to app list"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="dialog-title">{selectedApp.name}</span>
        </div>

        <div className="dialog-body">
          {widgets.length === 0 ? (
            <p className="empty-message">No widgets available</p>
          ) : (
            widgets.map((widget) => (
              <button
                key={widget.id}
                type="button"
                className="widget-option-btn"
                onClick={() => {
                  onAdd(widget.id);
                  onClose();
                }}
              >
                <div className="widget-option-icon">
                  <LayoutGrid size={16} />
                </div>

                <div className="widget-option-info">
                  <div className="widget-option-name">{widget.name}</div>
                  <div className="widget-option-desc">{widget.description}</div>
                </div>

                <span className="widget-size-badge">
                  {getSizeLabel(widget.size)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
