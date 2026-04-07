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

import type { Layout } from "react-grid-layout";
import { cloneLayout, findOrGenerateResponsiveLayout, Responsive, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Plus, Sparkles, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AddWidgetDialog from "@/components/dashboard/AddWidgetDialog";
import { updatePreferences } from "@/api/catalog";
import { useOnboarding } from "@/components/providers/OnboardingProvider";
import { useWorkspace } from "@/hooks/useWorkspace";
import { WIDGET_SIZES } from "@/lib/widget-sizes";
import LazyWidget from "@/components/LazyWidget";
import type {
  AppRuntimeEntry,
  PreferenceUpdate,
  WidgetManifestSchema,
  WidgetPreferenceSchema,
} from "@/types/generated/api";

const ResponsiveGridLayout = Responsive;

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 1 };
const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 0 };
const GRID_BREAKPOINT_ORDER = ["lg", "md", "sm", "xs"] as const;
const ROW_HEIGHT = 80;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResolvedWidget {
  widgetId: string;
  appId: string;
  app: AppRuntimeEntry;
  widget: WidgetManifestSchema;
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

function serializePreferenceConfig(config: WidgetPreferenceSchema["config"] | null | undefined) {
  if (!config) {
    return "";
  }

  const entries = Object.entries(config).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(entries);
}

function arePreferencesEqual(
  left: WidgetPreferenceSchema | undefined,
  right: WidgetPreferenceSchema | undefined
) {
  if (!left || !right) {
    return left === right;
  }

  return (
    left._id === right._id &&
    left.user_id === right.user_id &&
    left.widget_id === right.widget_id &&
    left.app_id === right.app_id &&
    left.enabled === right.enabled &&
    left.sort_order === right.sort_order &&
    left.size_w === right.size_w &&
    left.size_h === right.size_h &&
    serializePreferenceConfig(left.config) === serializePreferenceConfig(right.config)
  );
}

function arePreferenceMapsEqual(
  left: Map<string, WidgetPreferenceSchema>,
  right: Map<string, WidgetPreferenceSchema>
) {
  if (left.size !== right.size) {
    return false;
  }

  for (const [widgetId, leftPreference] of left) {
    if (!arePreferencesEqual(leftPreference, right.get(widgetId))) {
      return false;
    }
  }

  return true;
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
  widget: WidgetManifestSchema;
}) {
  // Dung LazyWidget de lazy load widget component
  return <LazyWidget appId={appId} widgetId={widgetId} widget={widget} />;
}

// ─── WidgetCard ──────────────────────────────────────────────────────────────

function WidgetCard({
  widget,
  children,
}: {
  widget: WidgetManifestSchema;
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
  workspacePreferences,
  commitWorkspacePreferenceUpdates,
}: {
  installedApps: AppRuntimeEntry[];
  workspacePreferences: WidgetPreferenceSchema[];
  commitWorkspacePreferenceUpdates: (updates: PreferenceUpdate[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLayoutRef = useRef<Layout[]>([]);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [busyWidgetId, setBusyWidgetId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.round(entry.contentRect.width);
        setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
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
  const workspacePreferenceMap = useMemo(
    () => new Map(workspacePreferences.map((pref) => [pref.widget_id, pref] as const)),
    [workspacePreferences]
  );

  const replacePrefs = useCallback((entries: Iterable<[string, WidgetPreferenceSchema]>) => {
    setPrefs(new Map(entries));
  }, []);

  useEffect(() => {
    setPrefs((current) => (
      arePreferenceMapsEqual(current, workspacePreferenceMap)
        ? current
        : new Map(workspacePreferenceMap)
    ));
  }, [workspacePreferenceMap]);

  const isWidgetEnabled = useCallback(
    (
      widget: WidgetManifestSchema,
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

  const visibleWidgetMap = useMemo(
    () => new Map(visibleWidgets.map((widget) => [widget.widgetId, widget] as const)),
    [visibleWidgets]
  );

  const layout = useMemo<Layout[]>(() => {
    return visibleWidgets.map((rw, idx) =>
      buildLayoutItem(rw, prefs.get(rw.widgetId), visibleWidgets.slice(0, idx), prefs)
    );
  }, [visibleWidgets, prefs]);

  const responsiveLayouts = useMemo(() => {
    const nextLayouts: Record<(typeof GRID_BREAKPOINT_ORDER)[number], Layout[]> = {
      lg: cloneLayout(layout),
      md: [],
      sm: [],
      xs: [],
    };

    let previousBreakpoint = GRID_BREAKPOINT_ORDER[0];
    for (const breakpoint of GRID_BREAKPOINT_ORDER.slice(1)) {
      nextLayouts[breakpoint] = findOrGenerateResponsiveLayout(
        nextLayouts,
        GRID_BREAKPOINTS,
        breakpoint,
        previousBreakpoint,
        GRID_COLS[breakpoint],
        null
      );
      previousBreakpoint = breakpoint;
    }

    return nextLayouts;
  }, [layout]);

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
          config: update.config ?? existing?.config ?? {},
          size_w: update.size_w ?? existing?.size_w ?? null,
          size_h: update.size_h ?? existing?.size_h ?? null,
        });
      }

      return next;
    });
  }, []);

  const buildLayoutUpdates = useCallback((currentLayout: Layout[]) => {
    const updates: PreferenceUpdate[] = [];

    for (const item of currentLayout) {
      const existing = prefs.get(item.i);
      const resolvedWidget = visibleWidgetMap.get(item.i);
      if (!resolvedWidget) {
        continue;
      }

      const defaultConfig = getSizeConfig(resolvedWidget.widget.size);
      const nextSizeW = item.w !== defaultConfig.width ? item.w : null;
      const nextSizeH = item.h !== defaultConfig.rglH ? item.h : null;
      const previousGridX = existing?.config?.gridX as number | undefined;
      const previousGridY = existing?.config?.gridY as number | undefined;
      const previousSizeW = existing?.size_w ?? null;
      const previousSizeH = existing?.size_h ?? null;

      if (
        previousGridX === item.x &&
        previousGridY === item.y &&
        previousSizeW === nextSizeW &&
        previousSizeH === nextSizeH
      ) {
        continue;
      }

      updates.push({
        widget_id: item.i,
        config: {
          ...(existing?.config ?? {}),
          gridX: item.x,
          gridY: item.y,
        },
        size_w: nextSizeW,
        size_h: nextSizeH,
      });
    }

    return updates;
  }, [prefs, visibleWidgetMap]);

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
        commitWorkspacePreferenceUpdates(updates);
      } catch (error: unknown) {
        console.error("Failed to update widget visibility", error);
        replacePrefs(previousPrefs);
      } finally {
        setBusyWidgetId(null);
      }
    },
    [
      applyUpdatesLocally,
      commitWorkspacePreferenceUpdates,
      getNextWidgetPlacement,
      persistUpdates,
      prefs,
      replacePrefs,
    ]
  );

  const handleLayoutChange = useCallback(
    (currentLayout: Layout[]) => {
      currentLayoutRef.current = currentLayout;
    },
    []
  );

  const handleLayoutCommit = useCallback(
    async (currentLayout: Layout[]) => {
      currentLayoutRef.current = currentLayout;
      const updates = buildLayoutUpdates(currentLayout);
      if (updates.length === 0) {
        return;
      }

      applyUpdatesLocally(updates);

      try {
        await persistUpdates(updates);
        commitWorkspacePreferenceUpdates(updates);
      } catch (error: unknown) {
        console.error("Failed to persist widget layout changes", error);
        replacePrefs(workspacePreferenceMap);
      }
    },
    [
      applyUpdatesLocally,
      buildLayoutUpdates,
      commitWorkspacePreferenceUpdates,
      persistUpdates,
      replacePrefs,
      workspacePreferenceMap,
    ]
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
      commitWorkspacePreferenceUpdates(updates);
    } catch (error: unknown) {
      console.error("Failed to auto-rearrange widgets", error);
      replacePrefs(workspacePreferenceMap);
    }
  }, [
    applyUpdatesLocally,
    commitWorkspacePreferenceUpdates,
    persistUpdates,
    prefs,
    replacePrefs,
    visibleWidgets,
    workspacePreferenceMap,
  ]);

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
        layouts={responsiveLayouts}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        width={containerWidth}
        compactor={verticalCompactor}
        dragConfig={{ enabled: true }}
        resizeConfig={{ enabled: true, handles: ["se"] }}
        onLayoutChange={handleLayoutChange}
        onDragStop={handleLayoutCommit}
        onResizeStop={handleLayoutCommit}
        margin={[16, 16]}
        containerPadding={[0, 0]}
      >
        {visibleWidgets.map(({ widgetId, appId, widget }) => (
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
  const {
    applyPreferenceUpdates,
    installedApps,
    isWorkspaceLoading: loading,
    widgetPreferences,
  } = useWorkspace();
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
            startTour("welcome");
          } else {
            // Retry after 500ms if element not found
            setTimeout(checkAndStart, 500);
          }
        };
        checkAndStart();
      }
    }, 100); // 100ms delay to let onboarding state hydrate

    return () => clearTimeout(timer);
  }, [isCompleted, loading, startTour]);

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

  const allWidgets = installedApps.flatMap((app) => app.widgets ?? []);

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

  return (
    <DashboardInner
      installedApps={installedApps}
      workspacePreferences={widgetPreferences}
      commitWorkspacePreferenceUpdates={applyPreferenceUpdates}
    />
  );
}
