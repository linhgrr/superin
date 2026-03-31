/**
 * AddWidgetDialog — 2-step widget manager.
 *
 * Step 1: pick an installed app
 * Step 2: show or hide widgets from that app
 *
 * Props:
 *   catalog     — AppCatalogEntry[]  (already filtered for is_installed)
 *   onToggleWidget — toggle widget visibility
 *   onClose     — () => void
 */

import {
  ArrowLeft,
  ArrowLeftRight,
  Calendar,
  CheckSquare,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  PieChart,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppCatalogEntry } from "@/types/generated/api";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AddWidgetDialogProps {
  catalog: AppCatalogEntry[];
  enabledWidgetIds: ReadonlySet<string>;
  busyWidgetId?: string | null;
  onToggleWidget: (widgetId: string, enabled: boolean) => Promise<void> | void;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SIZE_LABELS: Record<string, string> = {
  compact: "Compact",
  standard: "Standard",
  wide: "Wide",
  tall: "Tall",
  full: "Full Width",
};

const ICON_COMPONENTS = {
  ArrowLeftRight,
  Calendar,
  CheckSquare,
  PieChart,
  Wallet,
} as const;

function IconGlyph({
  iconName,
  fallback,
  size = 18,
}: {
  iconName?: string | null;
  fallback: string;
  size?: number;
}) {
  if (iconName) {
    const LucideIcon = ICON_COMPONENTS[iconName as keyof typeof ICON_COMPONENTS];
    if (LucideIcon) {
      return <LucideIcon size={size} strokeWidth={2} />;
    }
  }

  return <span>{fallback.slice(0, 2).toUpperCase()}</span>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AddWidgetDialog({
  catalog,
  enabledWidgetIds,
  busyWidgetId = null,
  onToggleWidget,
  onClose,
}: AddWidgetDialogProps) {
  const [selectedApp, setSelectedApp] = useState<AppCatalogEntry | null>(null);

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

  const selectedAppVisibleCount = selectedApp
    ? selectedApp.widgets.filter((widget) => enabledWidgetIds.has(widget.id)).length
    : 0;

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
              <p className="dialog-empty-message">No apps installed</p>
            ) : (
              catalog.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="option-btn app-option-btn"
                  onClick={() => setSelectedApp(app)}
                >
                  <div
                    className="dialog-icon-badge"
                    style={{ "--icon-bg": app.color + "22", "--icon-color": app.color } as React.CSSProperties}
                  >
                    <IconGlyph iconName={app.icon} fallback={app.name} size={18} />
                  </div>

                  <div className="option-info">
                    <div className="option-name">{app.name}</div>
                    <div className="app-option-count">
                      {app.widgets.filter((widget) => enabledWidgetIds.has(widget.id)).length}/
                      {app.widgets.length} visible
                    </div>
                  </div>

                  <LayoutGrid size={16} className="dialog-option-chevron" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: widget list ───────────────────────────────────────────────────

  const widgets = selectedApp.widgets;

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
            className="btn btn-ghost dialog-back-btn"
            onClick={() => setSelectedApp(null)}
            aria-label="Back to app list"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="option-info">
            <span className="dialog-title">{selectedApp.name}</span>
            <div className="app-option-count">
              {selectedAppVisibleCount}/{widgets.length} widgets visible
            </div>
          </div>
        </div>

        <div className="dialog-body">
          {widgets.length === 0 ? (
            <p className="dialog-empty-message">No widgets available</p>
          ) : (
            widgets.map((widget) => (
              <div key={widget.id} className="option-btn widget-option-row">
                <div className="widget-option-icon">
                  <IconGlyph iconName={widget.icon} fallback={widget.name} size={16} />
                </div>

                <div className="option-info">
                  <div className="option-name">{widget.name}</div>
                  <div className="widget-option-desc">{widget.description}</div>
                </div>

                <div className="widget-option-meta">
                  <div className="widget-option-badges">
                    <span className="widget-size-badge">
                      {SIZE_LABELS[widget.size] ?? widget.size}
                    </span>
                    <span
                      className={
                        enabledWidgetIds.has(widget.id)
                          ? "widget-visibility-badge is-visible"
                          : "widget-visibility-badge is-hidden"
                      }
                    >
                      {enabledWidgetIds.has(widget.id) ? "Visible" : "Hidden"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={
                      enabledWidgetIds.has(widget.id)
                        ? "btn btn-ghost btn-sm widget-visibility-btn"
                        : "btn btn-primary btn-sm widget-visibility-btn"
                    }
                    disabled={busyWidgetId === widget.id}
                    onClick={async () => {
                      await onToggleWidget(widget.id, !enabledWidgetIds.has(widget.id));
                    }}
                  >
                    {busyWidgetId === widget.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : enabledWidgetIds.has(widget.id) ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                    {enabledWidgetIds.has(widget.id) ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
