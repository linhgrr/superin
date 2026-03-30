/**
 * DashboardPage — main landing after login.
 *
 * Shows widget grid for all installed apps.
 * Each widget is rendered via a WidgetCard component.
 */

import { useEffect, useState } from "react";
import { getCatalog } from "@/api/catalog";
import { getPreferences } from "@/api/catalog";
import { WIDGET_SIZE_COLUMNS } from "@/config";
import type { AppCatalogEntry, WidgetPreferenceSchema } from "@/types/generated/api";
import AppShell from "./AppShell";
import FinanceWidget from "./widgets/FinanceWidget";
import TodoWidget from "./widgets/TodoWidget";

function WidgetCard({
  appId,
  widgetId,
  widget,
}: {
  appId: string;
  widgetId: string;
  widget: AppCatalogEntry["widgets"][number];
}) {
  const [prefs, setPrefs] = useState<WidgetPreferenceSchema[]>([]);

  useEffect(() => {
    if (!widget.requires_auth) return;
    getPreferences(appId)
      .then((p) => setPrefs(p.filter((x) => x.widget_id === widgetId)))
      .catch(() => {});
  }, [appId, widgetId]);

  const isEnabled = prefs.some((p) => p.enabled) || !widget.requires_auth;

  // Delegate to app-specific widget component
  let content: React.ReactNode = null;
  if (appId === "finance") {
    content = <FinanceWidget widgetId={widgetId} widget={widget} />;
  } else if (appId === "todo") {
    content = <TodoWidget widgetId={widgetId} widget={widget} />;
  }

  if (!isEnabled) return null;

  const colSpanClass = `widget-${widget.size}`;

  return (
    <div className={colSpanClass}>
      <div className="widget-card">{content}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [catalog, setCatalog] = useState<AppCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCatalog()
      .then((c) => setCatalog(c.filter((app) => app.is_installed)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: "1rem",
          }}
        >
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`widget-${["small", "medium", "large", "small", "medium", "large"][i]}`}
            >
              <div
                className="widget-card"
                style={{
                  height: "120px",
                  background: "var(--color-surface-elevated)",
                  animation: "pulse 1.5s infinite",
                }}
              />
            </div>
          ))}
        </div>
      </AppShell>
    );
  }

  const allWidgets = catalog.flatMap((app) =>
    app.widgets.map((w) => ({ app, widget: w }))
  );

  if (allWidgets.length === 0) {
    return (
      <AppShell title="Dashboard">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60vh",
            gap: "0.75rem",
            color: "var(--color-muted)",
          }}
        >
          <span style={{ fontSize: "2rem" }}>🛍</span>
          <p style={{ fontSize: "1rem", fontWeight: 500, color: "var(--color-foreground)" }}>
            No apps installed yet
          </p>
          <p style={{ fontSize: "0.875rem" }}>
            Visit the{" "}
            <a href="/store" style={{ color: "var(--color-primary)" }}>
              App Store
            </a>{" "}
            to get started.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      <div className="widget-grid">
        {allWidgets.map(({ app, widget }) => (
          <WidgetCard
            key={`${app.id}/${widget.id}`}
            appId={app.id}
            widgetId={widget.id}
            widget={widget}
          />
        ))}
      </div>
    </AppShell>
  );
}
