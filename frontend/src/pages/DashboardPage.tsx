/**
 * DashboardPage — main landing after login.
 *
 * Architecture:
 *   DashboardPage
 *   └── DashboardInner
 *       ├── ResponsiveGridLayout (always draggable)
 *       ├── AddWidgetDialog (overlay for show/hide widget)
 *       └── "Add Widget" button
 */

import ReactGridLayout, { Responsive } from "react-grid-layout";
type Layout = ReactGridLayout.Layout;
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Grid3X3, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getFrontendApp } from "@/apps";
import AddWidgetDialog from "@/components/dashboard/AddWidgetDialog";
import { useAppCatalog } from "@/components/providers/AppProviders";
import { getAllPreferences, updatePreferences } from "@/api/catalog";
import { WIDGET_SIZES } from "@/lib/widget-sizes";
import type {
  AppCatalogEntry,
  PreferenceUpdate,
  WidgetPreferenceSchema,
} from "@/types/generated/api";

const ResponsiveGridLayout = Responsive;

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 1 };
const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 0 };
const ROW_HEIGHT = 80;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Flattened widget record used internally to track position & visibility. */
interface ResolvedWidget {
  widgetId: string; // full id e.g. "finance.total-balance"
  appId: string;
  app: AppCatalogEntry;
  widget: AppCatalogEntry["widgets"][number];
  position: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSizeConfig(size: string) {
  return WIDGET_SIZES[size as keyof typeof WIDGET_SIZES] ?? WIDGET_SIZES.standard;
}

function appIdFrom(widgetId: string) {
  const dot = widgetId.indexOf(".");
  return dot === -1 ? widgetId : widgetId.slice(0, dot);
}

/** Build an RGL Layout item from a resolved widget + its saved config. */
function buildLayoutItem(
  rw: ResolvedWidget,
  pref: WidgetPreferenceSchema | undefined,
  previousWidgets: ResolvedWidget[],
): Layout {
  const config = getSizeConfig(rw.widget.size);
  const w = config.width;
  const h = config.rglH;

  // Use saved grid position from pref.config if available
  const savedX = pref?.config?.gridX as number | undefined;
  const savedY = pref?.config?.gridY as number | undefined;

  if (savedX !== undefined && savedY !== undefined) {
    return { i: rw.widgetId, x: savedX, y: savedY, w, h };
  }

  // Auto-pack fallback: place sequentially in the 12-column grid
  // Each widget takes `w` columns, so stack them row by row
  let col = 0;
  let row = 0;
  for (const previousWidget of previousWidgets) {
    const prevConfig = getSizeConfig(previousWidget.widget.size);
    col += prevConfig.width;
    if (col >= 12) {
      col = 0;
      row += prevConfig.rglH;
    }
  }
  return { i: rw.widgetId, x: col % 12, y: row, w, h };
}

// ─── WidgetContent ─────────────────────────────────────────────────────────────

/** Renders the actual widget component based on appId. */
function WidgetContent({
  appId,
  widgetId,
  widget,
}: {
  appId: string;
  widgetId: string;
  widget: AppCatalogEntry["widgets"][number];
}) {
  const appDefinition = getFrontendApp(appId);

  if (appDefinition?.DashboardWidget) {
    const DashboardWidget = appDefinition.DashboardWidget;
    return <DashboardWidget widgetId={widgetId} widget={widget} />;
  }

  // Fallback for unknown apps
  return (
    <div>
      <p className="section-label">{widget.name}</p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
        {widget.description}
      </p>
    </div>
  );
}

function DashboardInner({
  installedApps,
}: {
  installedApps: AppCatalogEntry[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLayoutRef = useRef<Layout[]>([]);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [busyWidgetId, setBusyWidgetId] = useState<string | null>(null);
  const [isPrefsLoaded, setIsPrefsLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const [prefs, setPrefs] = useState<Map<string, WidgetPreferenceSchema>>(new Map());
  const installedAppIds = useMemo(
    () => new Set(installedApps.map((a) => a.id)),
    [installedApps]
  );

  // ── Load preferences ────────────────────────────────────────────────────────

  const replacePrefs = useCallback((entries: Iterable<[string, WidgetPreferenceSchema]>) => {
    setPrefs(new Map(entries));
  }, []);

  const loadPrefs = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) {
      setIsPrefsLoaded(false);
    }

    try {
      const fetchedPrefs = await getAllPreferences();
      replacePrefs(fetchedPrefs.map((pref) => [pref.widget_id, pref] as const));
    } finally {
      if (showSkeleton) {
        setIsPrefsLoaded(true);
      }
    }
  }, [replacePrefs]);

  useEffect(() => {
    loadPrefs(true);
  }, [loadPrefs]);

  const isWidgetEnabled = useCallback(
    (
      widget: AppCatalogEntry["widgets"][number],
      pref: WidgetPreferenceSchema | undefined
    ) => pref?.enabled ?? !widget.requires_auth,
    []
  );

  const enabledWidgetIds = useMemo(() => {
    const next = new Set<string>();

    for (const app of installedApps) {
      for (const widget of app.widgets) {
        if (isWidgetEnabled(widget, prefs.get(widget.id))) {
          next.add(widget.id);
        }
      }
    }

    return next;
  }, [installedApps, isWidgetEnabled, prefs]);

  /**
   * Returns widgets that should currently be visible, sorted by position.
   */
  const visibleWidgets = useMemo<ResolvedWidget[]>(() => {
    const items: ResolvedWidget[] = [];

    for (const app of installedApps) {
      for (const widget of app.widgets) {
        const prefsEntry = prefs.get(widget.id);
        if (!isWidgetEnabled(widget, prefsEntry)) continue;

        const position = prefsEntry?.position ?? 0;
        items.push({ widgetId: widget.id, appId: app.id, app, widget, position });
      }
    }

    return items.sort((a, b) => a.position - b.position);
  }, [installedApps, isWidgetEnabled, prefs]);

  // ── Build RGL layout ────────────────────────────────────────────────────────

  const layout = useMemo<Layout[]>(() => {
    return visibleWidgets.map((rw, idx) =>
      buildLayoutItem(rw, prefs.get(rw.widgetId), visibleWidgets.slice(0, idx))
    );
  }, [visibleWidgets, prefs]);

  useEffect(() => {
    currentLayoutRef.current = layout;
  }, [layout]);

  const applyUpdatesLocally = useCallback((updates: PreferenceUpdate[]) => {
    setPrefs((prev) => {
      const next = new Map(prev);

      for (const update of updates) {
        const widgetId = update.widget_id;
        const existing = next.get(widgetId);

        next.set(widgetId, {
          _id: existing?._id ?? null,
          user_id: existing?.user_id ?? "",
          widget_id: widgetId,
          app_id: existing?.app_id ?? appIdFrom(widgetId),
          enabled: update.enabled ?? existing?.enabled ?? false,
          position: update.position ?? existing?.position ?? 0,
          config: update.config ?? existing?.config,
          size: update.size ?? existing?.size ?? null,
        });
      }

      return next;
    });
  }, []);

  const persistUpdates = useCallback(
    async (updates: PreferenceUpdate[]) => {
      const byApp = new Map<string, PreferenceUpdate[]>();

      for (const update of updates) {
        const appId = appIdFrom(update.widget_id);
        if (!installedAppIds.has(appId)) continue;

        const appUpdates = byApp.get(appId) ?? [];
        appUpdates.push(update);
        byApp.set(appId, appUpdates);
      }

      await Promise.all(
        [...byApp].map(([appId, appUpdates]) => updatePreferences(appId, appUpdates))
      );
    },
    [installedAppIds]
  );

  const getNextWidgetPlacement = useCallback(() => {
    const source = currentLayoutRef.current.length ? currentLayoutRef.current : layout;

    if (source.length === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: 0,
      y: source.reduce((maxY, item) => Math.max(maxY, item.y + item.h), 0),
    };
  }, [layout]);

  const handleWidgetVisibilityChange = useCallback(
    async (widgetId: string, enabled: boolean) => {
      setBusyWidgetId(widgetId);
      const previousPrefs = new Map(prefs);

      const existing = prefs.get(widgetId);
      const nextPlacement = enabled ? getNextWidgetPlacement() : null;
      const updates: PreferenceUpdate[] = [
        {
          widget_id: widgetId,
          enabled,
          ...(nextPlacement
            ? {
                config: {
                  ...(existing?.config ?? {}),
                  gridX: nextPlacement.x,
                  gridY: nextPlacement.y,
                },
              }
            : {}),
        },
      ];

      applyUpdatesLocally(updates);

      try {
        await persistUpdates(updates);
      } catch {
        replacePrefs(previousPrefs);
      } finally {
        setBusyWidgetId(null);
      }
    },
    [applyUpdatesLocally, getNextWidgetPlacement, persistUpdates, prefs, replacePrefs]
  );

  const handleLayoutChange = useCallback(
    (currentLayout: Layout[]) => {
      currentLayoutRef.current = currentLayout;
    },
    []
  );

  const handleDragStop = useCallback(
    async (currentLayout: Layout[]) => {
      currentLayoutRef.current = currentLayout;

      const updates: PreferenceUpdate[] = currentLayout.map((item) => {
        const existing = prefs.get(item.i);

        return {
          widget_id: item.i,
          config: {
            ...(existing?.config ?? {}),
            gridX: item.x,
            gridY: item.y,
          },
        };
      });

      applyUpdatesLocally(updates);

      try {
        await persistUpdates(updates);
      } catch {
        void loadPrefs(false);
      }
    },
    [applyUpdatesLocally, loadPrefs, persistUpdates, prefs]
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!isPrefsLoaded) {
    return (
      <div className="widget-grid">
        {(["standard", "wide", "standard"] as const).map((size, i) => (
          <div key={i} className={`widget-size-${size}`}>
            <div
              className="widget-card"
              style={{
                minHeight: WIDGET_SIZES[size].height === "auto" ? "120px" : WIDGET_SIZES[size].height,
                background: "var(--color-surface-elevated)",
                animation: "pulse 1.5s infinite",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setIsDialogOpen(true)}
          aria-label="Add widget"
        >
          <Plus size={14} />
          Add Widget
        </button>
      </div>

      <ResponsiveGridLayout
        className="dashboard-grid-layout"
        layouts={{ lg: layout }}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        width={containerWidth}
        isDraggable
        isResizable={false}
        compactType={null}
        onLayoutChange={handleLayoutChange}
        onDragStop={handleDragStop}
        margin={[16, 16]}
        containerPadding={[0, 0]}
      >
        {visibleWidgets.map(({ widgetId, appId, widget }) => (
          <div key={widgetId} className="rgl-item-view">
            <div className="widget-card">
              <WidgetContent appId={appId} widgetId={widgetId} widget={widget} />
            </div>
          </div>
        ))}
      </ResponsiveGridLayout>

      {isDialogOpen && (
        <AddWidgetDialog
          catalog={installedApps}
          enabledWidgetIds={enabledWidgetIds}
          busyWidgetId={busyWidgetId}
          onToggleWidget={handleWidgetVisibilityChange}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </div>
  );
}


// ─── Page root ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { installedApps: catalog, isCatalogLoading: loading } = useAppCatalog();

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="widget-grid">
        {(["standard", "wide", "standard", "compact", "standard"] as const).map((size, i) => (
          <div key={i} className={`widget-size-${size}`}>
            <div
              className="widget-card"
              style={{
                minHeight: WIDGET_SIZES[size].height === "auto" ? "120px" : WIDGET_SIZES[size].height,
                background: "var(--color-surface-elevated)",
                animation: "pulse 1.5s infinite",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  const allWidgets = catalog.flatMap((app) => app.widgets ?? []);

  if (allWidgets.length === 0) {
    return (
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
        <Grid3X3 size={48} />
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
    );
  }

  // ── Normal render ───────────────────────────────────────────────────────────

  return <DashboardInner installedApps={catalog} />;
}
