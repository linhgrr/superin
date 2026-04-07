"use client";

/**
 * AddWidgetDialog — Refined 2-step widget manager.
 *
 * Now uses dynamic icon resolution from backend-provided icon names.
 */

import { ArrowLeft, Eye, EyeOff, LayoutGrid, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";
import type { AppRuntimeEntry } from "@/types/generated";

export interface AddWidgetDialogProps {
  catalog: AppRuntimeEntry[];
  enabledWidgetIds: ReadonlySet<string>;
  busyWidgetId?: string | null;
  onToggleWidget: (widgetId: string, enabled: boolean) => Promise<void> | void;
  onClose: () => void;
}

const SIZE_LABELS: Record<string, string> = {
  compact: "Compact",
  standard: "Standard",
  wide: "Wide",
  tall: "Tall",
  full: "Full Width",
};

const SIZE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  compact: { bg: "oklch(0.55 0.05 80 / 0.15)", text: "oklch(0.55 0.05 80)" },
  standard: { bg: "oklch(0.65 0.1 280 / 0.15)", text: "oklch(0.65 0.1 280)" },
  wide: { bg: "oklch(0.65 0.18 35 / 0.15)", text: "oklch(0.65 0.18 35)" },
  tall: { bg: "oklch(0.55 0.15 250 / 0.15)", text: "oklch(0.55 0.15 250)" },
  full: { bg: "oklch(0.6 0.2 145 / 0.15)", text: "oklch(0.6 0.2 145)" },
};

function IconGlyph({
  iconName,
  size = 18,
}: {
  iconName?: string | null;
  size?: number;
}) {
  // Use DynamicIcon for any icon name - no more hardcoded mapping needed
  return (
    <DynamicIcon
      name={iconName ?? undefined}
      size={size}
      strokeWidth={2}
    />
  );
}

function LoadingSpinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export default function AddWidgetDialog({
  catalog,
  enabledWidgetIds,
  busyWidgetId = null,
  onToggleWidget,
  onClose,
}: AddWidgetDialogProps) {
  const [selectedApp, setSelectedApp] = useState<AppRuntimeEntry | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const selectedAppVisibleCount = selectedApp
    ? (selectedApp.widgets ?? []).filter((widget) => enabledWidgetIds.has(widget.id)).length
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
          style={{ maxWidth: "420px" }}
        >
          <div className="dialog-header">
            <span className="dialog-title">Add Widget</span>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={onClose}
              style={{ marginLeft: "auto" }}
            >
              <X size={18} />
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
                  const visibleCount = widgets.filter((widget) =>
                    enabledWidgetIds.has(widget.id)
                  ).length;

                  return (
                    <button
                      key={app.id}
                      type="button"
                      className="option-btn"
                      onClick={() => setSelectedApp(app)}
                      style={{
                        padding: "0.875rem 1rem",
                        borderRadius: "12px",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div
                        className="option-icon"
                        style={{
                          background: app.color
                            ? `${app.color}22`
                            : "var(--color-surface-elevated)",
                          color: app.color || "var(--color-foreground-muted)",
                          border: app.color ? `1px solid ${app.color}33` : undefined,
                        }}
                      >
                        <IconGlyph iconName={app.icon} size={18} />
                      </div>

                      <div className="option-info">
                        <div className="option-name">{app.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
                          {visibleCount}/{widgets.length} widgets visible
                        </div>
                      </div>

                      <LayoutGrid size={18} style={{ color: "var(--color-foreground-muted)" }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: widget list ───────────────────────────────────────────────────

  const widgets = selectedApp.widgets ?? [];

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
        style={{ maxWidth: "480px" }}
      >
        <div className="dialog-header">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setSelectedApp(null)}
            aria-label="Back to app list"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="option-info" style={{ marginLeft: "0.5rem" }}>
            <span className="dialog-title">{selectedApp.name}</span>
            <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
              {selectedAppVisibleCount}/{widgets.length} widgets visible
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ marginLeft: "auto" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body" style={{ padding: "0.5rem" }}>
          {widgets.length === 0 ? (
            <div className="empty-state" style={{ padding: "2rem 1rem" }}>
              <p style={{ color: "var(--color-foreground-muted)" }}>No widgets available</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {widgets.map((widget) => {
                const isEnabled = enabledWidgetIds.has(widget.id);
                const isBusy = busyWidgetId === widget.id;
                const sizeStyle = SIZE_BADGE_COLORS[widget.size] || SIZE_BADGE_COLORS.standard;

                return (
                  <div
                    key={widget.id}
                    className="option-btn"
                    style={{
                      flexDirection: "column",
                      alignItems: "flex-start",
                      padding: "1rem",
                      borderRadius: "12px",
                      gap: "0.75rem",
                      border: isEnabled ? "1px solid var(--color-primary-muted)" : undefined,
                      background: isEnabled ? "var(--color-primary-muted)" : undefined,
                    }}
                  >
                    <div style={{ display: "flex", width: "100%", gap: "0.75rem" }}>
                      <div className="option-icon">
                        <IconGlyph iconName={widget.icon} size={16} />
                      </div>

                      <div className="option-info" style={{ flex: 1 }}>
                        <div className="option-name">{widget.name}</div>
                        <div className="option-description">{widget.description}</div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        width: "100%",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "0.25rem",
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        <span
                          className="badge"
                          style={{
                            background: sizeStyle.bg,
                            color: sizeStyle.text,
                            fontSize: "0.625rem",
                            padding: "0.25rem 0.5rem",
                          }}
                        >
                          {SIZE_LABELS[widget.size] ?? widget.size}
                        </span>
                        <span
                          className="badge"
                          style={{
                            background: isEnabled
                              ? "oklch(0.75 0.18 145 / 0.15)"
                              : "oklch(0.55 0.02 265 / 0.15)",
                            color: isEnabled
                              ? "var(--color-success)"
                              : "var(--color-foreground-muted)",
                            fontSize: "0.625rem",
                            padding: "0.25rem 0.5rem",
                          }}
                        >
                          {isEnabled ? "Visible" : "Hidden"}
                        </span>
                      </div>

                      <button
                        type="button"
                        className={`btn btn-sm ${isEnabled ? "btn-ghost" : "btn-primary"}`}
                        disabled={isBusy}
                        onClick={async () => {
                          await onToggleWidget(widget.id, !isEnabled);
                        }}
                        style={{ minWidth: "80px", justifyContent: "center" }}
                      >
                        {isBusy ? (
                          <LoadingSpinner />
                        ) : isEnabled ? (
                          <>
                            <EyeOff size={14} style={{ marginRight: "0.375rem" }} />
                            Hide
                          </>
                        ) : (
                          <>
                            <Eye size={14} style={{ marginRight: "0.375rem" }} />
                            Show
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
