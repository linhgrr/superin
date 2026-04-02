/**
 * DashboardPage — Refined dashboard experience.
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
import { Grid3X3, Plus, Sparkles, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getFrontendApp } from "@/apps";
import AddWidgetDialog from "@/components/dashboard/AddWidgetDialog";
import { useAppCatalog, useOnboarding } from "@/components/providers/AppProviders";
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

interface ResolvedWidget {
  widgetId: string;
  appId: string;
  app: AppCatalogEntry;
  widget: AppCatalogEntry["widgets"][number];
  sort_order: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSizeConfig(size: string) {
  return WIDGET_SIZES[size as keyof typeof WIDGET_SIZES] ?? WIDGET_SIZES.standard;
}

function appIdFrom(widgetId: string) {
  const dot = widgetId.indexOf(".");
  return dot === -1 ? widgetId : widgetId.slice(0, dot);
}

// ─── Auto Rearrange Helper ───────────────────────────────────────────────────

function autoRearrangeWidgets(widgets: ResolvedWidget[], prefs: Map<string, WidgetPreferenceSchema>): Layout[] {
  // Sort by actual width (custom size from prefs or default from manifest)
  const sorted = [...widgets].sort((a, b) => {
    const aPref = prefs.get(a.widgetId);
    const bPref = prefs.get(b.widgetId);
    const aConfig = getSizeConfig(a.widget.size);
    const bConfig = getSizeConfig(b.widget.size);
    // Use actual width (custom or default)
    const aWidth = aPref?.size_w ?? aConfig.width;
    const bWidth = bPref?.size_w ?? bConfig.width;
    return bWidth - aWidth; // Larger first for better packing
  });

  const layout: Layout[] = [];
  let currentRow = 0;
  let currentCol = 0;
  let rowHeight = 0;

  for (const rw of sorted) {
    const pref = prefs.get(rw.widgetId);
    const config = getSizeConfig(rw.widget.size);
    const w = pref?.size_w ?? config.width;
    const h = pref?.size_h ?? config.rglH;

    // Check if widget fits in current row
    if (currentCol + w > 12) {
      // Move to next row
      currentRow += rowHeight;
      currentCol = 0;
      rowHeight = 0;
    }

    layout.push({
      i: rw.widgetId,
      x: currentCol,
      y: currentRow,
      w,
      h,
    });

    currentCol += w;
    rowHeight = Math.max(rowHeight, h);
  }

  return layout;
}

function buildLayoutItem(
  rw: ResolvedWidget,
  pref: WidgetPreferenceSchema | undefined,
  previousWidgets: ResolvedWidget[],
  allPrefs: Map<string, WidgetPreferenceSchema>,
): Layout {
  // Use custom dimensions from preferences if available, otherwise use manifest default
  const config = getSizeConfig(rw.widget.size);
  const w = pref?.size_w ?? config.width;
  const h = pref?.size_h ?? config.rglH;

  const savedX = pref?.config?.gridX as number | undefined;
  const savedY = pref?.config?.gridY as number | undefined;

  if (savedX !== undefined && savedY !== undefined) {
    return { i: rw.widgetId, x: savedX, y: savedY, w, h };
  }

  let col = 0;
  let row = 0;
  for (const previousWidget of previousWidgets) {
    const prevPref = allPrefs.get(previousWidget.widgetId);
    const prevConfig = getSizeConfig(previousWidget.widget.size);
    // Use custom width if saved, otherwise use default
    const prevW = prevPref?.size_w ?? prevConfig.width;
    col += prevW;
    if (col >= 12) {
      col = 0;
      // Use custom height for row calculation
      const prevH = prevPref?.size_h ?? prevConfig.rglH;
      row += prevH;
    }
  }
  return { i: rw.widgetId, x: col % 12, y: row, w, h };
}

// ─── WidgetContent ─────────────────────────────────────────────────────────────

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

  return (
    <div className="empty-state" style={{ padding: "2rem 1rem" }}>
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          background: "var(--color-surface-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "0.75rem",
          color: "var(--color-foreground-muted)",
        }}
      >
        <Grid3X3 size={24} />
      </div>
      <p className="widget-card-title">{widget.name}</p>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-foreground-muted)", margin: 0 }}>
        {widget.description}
      </p>
    </div>
  );
}

// ─── WidgetCard ──────────────────────────────────────────────────────────────

function WidgetCard({
  widget,
  children,
}: {
  widget: AppCatalogEntry["widgets"][number];
  children: React.ReactNode;
}) {
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  return (
    <div
      className="widget-card"
      onMouseMove={handleMouseMove}
      style={{
        "--mouse-x": `${mousePos.x}%`,
        "--mouse-y": `${mousePos.y}%`,
        display: "flex",
        flexDirection: "column",
      } as React.CSSProperties}
    >
      <div className="widget-card-title" style={{ flexShrink: 0 }}>
        {widget.name}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}

// ─── DashboardInner ─────────────────────────────────────────────────────────

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

  const visibleWidgets = useMemo<ResolvedWidget[]>(() => {
    const items: ResolvedWidget[] = [];

    for (const app of installedApps) {
      for (const widget of app.widgets) {
        const prefsEntry = prefs.get(widget.id);
        if (!isWidgetEnabled(widget, prefsEntry)) continue;

        const sort_order = prefsEntry?.sort_order ?? 0;
        items.push({ widgetId: widget.id, appId: app.id, app, widget, sort_order });
      }
    }

    return items.sort((a, b) => a.sort_order - b.sort_order);
  }, [installedApps, isWidgetEnabled, prefs]);

  const layout = useMemo<Layout[]>(() => {
    return visibleWidgets.map((rw, idx) =>
      buildLayoutItem(rw, prefs.get(rw.widgetId), visibleWidgets.slice(0, idx), prefs)
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
          sort_order: update.sort_order ?? existing?.sort_order ?? 0,
          config: update.config ?? existing?.config,
          size: update.size ?? existing?.size ?? null,
          size_w: update.size_w ?? existing?.size_w ?? null,
          size_h: update.size_h ?? existing?.size_h ?? null,
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
        const defaultConfig = getSizeConfig(
          visibleWidgets.find((vw) => vw.widgetId === item.i)?.widget.size ?? "standard"
        );

        // Save position AND current size (in case it changed during drag)
        const sizeW = item.w !== defaultConfig.width ? item.w : null;
        const sizeH = item.h !== defaultConfig.rglH ? item.h : null;

        return {
          widget_id: item.i,
          config: {
            ...(existing?.config ?? {}),
            gridX: item.x,
            gridY: item.y,
          },
          size_w: sizeW,
          size_h: sizeH,
        };
      });

      applyUpdatesLocally(updates);

      try {
        await persistUpdates(updates);
      } catch {
        void loadPrefs(false);
      }
    },
    [applyUpdatesLocally, loadPrefs, persistUpdates, prefs, visibleWidgets]
  );

  // Handle resize - save custom dimensions
  const handleResizeStop = useCallback(
    async (currentLayout: Layout[]) => {
      currentLayoutRef.current = currentLayout;

      const updates: PreferenceUpdate[] = currentLayout.map((item) => {
        const existing = prefs.get(item.i);
        const defaultConfig = getSizeConfig(
          visibleWidgets.find((vw) => vw.widgetId === item.i)?.widget.size ?? "standard"
        );

        // Save custom size if different from manifest default, otherwise explicit null to reset
        const sizeW = item.w !== defaultConfig.width ? item.w : null;
        const sizeH = item.h !== defaultConfig.rglH ? item.h : null;

        return {
          widget_id: item.i,
          config: {
            ...(existing?.config ?? {}),
            gridX: item.x,
            gridY: item.y,
          },
          size_w: sizeW,
          size_h: sizeH,
        };
      });

      applyUpdatesLocally(updates);

      try {
        await persistUpdates(updates);
      } catch {
        void loadPrefs(false);
      }
    },
    [applyUpdatesLocally, loadPrefs, persistUpdates, prefs, visibleWidgets]
  );

  // Auto rearrange widgets in optimal grid layout
  const handleAutoRearrange = useCallback(async () => {
    if (visibleWidgets.length === 0) return;

    const newLayout = autoRearrangeWidgets(visibleWidgets, prefs);
    currentLayoutRef.current = newLayout;

    const updates: PreferenceUpdate[] = newLayout.map((item) => {
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
  }, [applyUpdatesLocally, loadPrefs, persistUpdates, prefs, visibleWidgets]);

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
                animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ animation: "fadeIn 0.4s ease" }}>
      {/* Add widget button */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleAutoRearrange}
          aria-label="Auto rearrange widgets"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <LayoutGrid size={16} />
          Auto Arrange
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setIsDialogOpen(true)}
          aria-label="Add widget"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Plus size={16} />
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
        isResizable
        resizeHandles={["se"]}
        compactType={null}
        preventCollision
        onLayoutChange={handleLayoutChange}
        onDragStop={handleDragStop}
        onResizeStop={handleResizeStop}
        margin={[16, 16]}
        containerPadding={[0, 0]}
      >
        {visibleWidgets.map(({ widgetId, appId, widget, app }) => (
          <div key={widgetId} className="rgl-item-view">
            <WidgetCard widget={widget}>
              <WidgetContent appId={appId} widgetId={widgetId} widget={widget} />
            </WidgetCard>
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
  const { startTour, isCompleted } = useOnboarding();
  const tourStartedRef = useRef(false);

  // Auto-start welcome tour for first-time users (only once)
  useEffect(() => {
    // Small delay to ensure onboarding state is fully loaded from localStorage
    const timer = setTimeout(() => {
      if (!loading && !tourStartedRef.current && !isCompleted("welcome")) {
        tourStartedRef.current = true;
        // Wait for DOM to be ready and elements to exist
        const checkAndStart = () => {
          const sidebar = document.querySelector(".sidebar-brand");
          if (sidebar) {
            console.log("[Onboarding] Starting welcome tour...");
            startTour("welcome");
          } else {
            console.log("[Onboarding] Waiting for sidebar...");
            // Retry after 500ms if element not found
            setTimeout(checkAndStart, 500);
          }
        };
        checkAndStart();
      }
    }, 100); // 100ms delay to let onboarding state hydrate

    return () => clearTimeout(timer);
  }, [loading, isCompleted, startTour]);

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
                animation: `pulse 1.5s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  const allWidgets = catalog.flatMap((app) => app.widgets ?? []);

  if (allWidgets.length === 0) {
    return (
      <div className="empty-state" style={{ height: "60vh" }}>
        <div className="empty-state-icon">
          <Sparkles size={32} />
        </div>
        <h3 className="empty-state-title">Welcome to Shin</h3>
        <p className="empty-state-description">
          Your dashboard is empty. Visit the{" "}
          <a href="/store" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            App Store
          </a>{" "}
          to install your first app.
        </p>
      </div>
    );
  }

  return <DashboardInner installedApps={catalog} />;
}
