/**
 * WidgetCard — card wrapper for dashboard widgets.
 * Adds a mouse-tracking gradient sheen effect and optional settings gear.
 */

import { memo, useState } from "react";
import type { WidgetManifestSchema } from "@/types/generated";
import { DynamicIcon } from "@/lib/icon-resolver";
import { getWidgetSettings } from "@/lib/widget-settings-registry";

interface WidgetCardProps {
  widget: WidgetManifestSchema;
  widgetId: string;
  currentConfig?: Record<string, unknown>;
  onConfigSave?: (config: Record<string, unknown>) => void;
  children: React.ReactNode;
}

const WidgetCard = memo(function WidgetCard({
  widget,
  widgetId,
  currentConfig,
  onConfigSave,
  children,
}: WidgetCardProps) {
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [showSettings, setShowSettings] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const SettingsComponent = getWidgetSettings(widgetId);
  const hasSettings = !!SettingsComponent;

  return (
    <>
      <div
        className="widget-card"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMousePos({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
          });
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          "--mouse-x": `${mousePos.x}%`,
          "--mouse-y": `${mousePos.y}%`,
          display: "flex",
          flexDirection: "column",
        } as React.CSSProperties}
      >
        <div
          className="widget-card-title"
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            {widget.icon && <DynamicIcon name={widget.icon} size={14} />}
            <span>{widget.name}</span>
          </span>
          {hasSettings && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSettings(true);
              }}
              style={{
                background: "none",
                border: "none",
                padding: "0.25rem",
                cursor: "pointer",
                color: "var(--color-foreground-muted)",
                opacity: isHovered ? 0.8 : 0,
                transition: "opacity 0.15s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
              }}
              aria-label={`${widget.name} settings`}
            >
              <DynamicIcon name="Settings" size={14} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {children}
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && SettingsComponent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "oklch(0 0 0 / 0.5)",
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            style={{
              background: "var(--color-background)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              maxWidth: "420px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 20px 60px oklch(0 0 0 / 0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <SettingsComponent
              widgetId={widgetId}
              currentConfig={currentConfig ?? {}}
              onSave={(config) => {
                onConfigSave?.(config);
                setShowSettings(false);
              }}
              onClose={() => setShowSettings(false)}
            />
          </div>
        </div>
      )}
    </>
  );
});

export default WidgetCard;
