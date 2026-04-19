/**
 * Widget preferences hook — manages preference state, local updates, and server persistence.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layout } from "react-grid-layout";
import { cloneLayout, findOrGenerateResponsiveLayout } from "react-grid-layout";

import type {
  AppRuntimeEntry,
  PreferenceUpdate,
  WidgetManifestSchema,
  WidgetPreferenceSchema,
} from "@/types/generated";
import {
  arePreferenceMapsEqual,
  autoRearrangeWidgets,
  computePackedLayout,
} from "./layout-engine";
import {
  applyUpdatesToPreferenceMap,
  buildLayoutUpdates,
  buildPreferenceMap,
  getNextWidgetPlacement,
  persistPreferenceUpdates,
  resolveVisibleWidgets,
  type ResolvedWidget,
} from "./widget-preference-state";

export const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 1 } as const;
export const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 0 } as const;
export const GRID_BREAKPOINT_ORDER = ["lg", "md", "sm", "xs"] as const;
export const ROW_HEIGHT = 80;
export type GridBreakpoint = (typeof GRID_BREAKPOINT_ORDER)[number];
type ResponsiveLayouts = { lg: Layout; md: Layout; sm: Layout; xs: Layout };

export type { Layout };

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseWidgetPreferencesOptions {
  installedApps: AppRuntimeEntry[];
  workspacePreferences: WidgetPreferenceSchema[];
  onCommit: (updates: PreferenceUpdate[]) => void;
}

export function useWidgetPreferences({
  installedApps,
  workspacePreferences,
  onCommit,
}: UseWidgetPreferencesOptions) {
  // Tracks the current grid layout for computing next widget placement
  const currentLayoutRef = useRef<Layout>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [busyWidgetId, setBusyWidgetId] = useState<string | null>(null);

  const installedAppIds = useMemo(
    () => new Set(installedApps.map((a) => a.id)),
    [installedApps]
  );

  const workspacePreferenceMap = useMemo(
    () => buildPreferenceMap(workspacePreferences),
    [workspacePreferences]
  );

  const [prefs, setPrefs] = useState<Map<string, WidgetPreferenceSchema>>(
    () => buildPreferenceMap(workspacePreferences)
  );

  // Sync from external changes (e.g., other browser tabs via storage events)
  useEffect(() => {
    setPrefs((current) =>
      arePreferenceMapsEqual(current, workspacePreferenceMap)
        ? current
        : workspacePreferenceMap // use the already-built map — avoid recomputation
    );
  }, [workspacePreferenceMap]);

  // RAF-gated ResizeObserver — only fires once per frame to avoid per-pixel re-renders
  useEffect(() => {
    if (!containerRef.current) return;
    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!containerRef.current) return;
        const nextWidth = Math.round(containerRef.current.getBoundingClientRect().width);
        setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
      });
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // ─── Computed: enabled widgets ──────────────────────────────────────────────

  const isWidgetEnabled = useCallback(
    (widget: WidgetManifestSchema, pref: WidgetPreferenceSchema | undefined) =>
      pref?.enabled ?? !widget.requires_auth,
    []
  );

  const enabledWidgetIds = useMemo(() => {
    const next = new Set<string>();
    for (const app of installedApps) {
      for (const widget of app.widgets ?? []) {
        if (isWidgetEnabled(widget, prefs.get(widget.id))) {
          next.add(widget.id);
        }
      }
    }
    return next;
  }, [installedApps, isWidgetEnabled, prefs]);

  const visibleWidgets = useMemo<ResolvedWidget[]>(() => {
    return resolveVisibleWidgets({ installedApps, isWidgetEnabled, prefs });
  }, [installedApps, isWidgetEnabled, prefs]);

  const visibleWidgetMap = useMemo(
    () => new Map(visibleWidgets.map((w) => [w.widgetId, w] as const)),
    [visibleWidgets]
  );

  const layout = useMemo<Layout>(
    () => computePackedLayout(visibleWidgets, prefs, GRID_COLS.lg),
    [visibleWidgets, prefs]
  );

  const responsiveLayouts = useMemo<ResponsiveLayouts>(() => {
    const nextLayouts: ResponsiveLayouts = {
      lg: cloneLayout(layout),
      md: [],
      sm: [],
      xs: [],
    };
    let prevBp: GridBreakpoint = GRID_BREAKPOINT_ORDER[0];
    for (const bp of GRID_BREAKPOINT_ORDER.slice(1)) {
      nextLayouts[bp] = findOrGenerateResponsiveLayout(
        nextLayouts,
        GRID_BREAKPOINTS,
        bp,
        prevBp,
        GRID_COLS[bp],
        null
      );
      prevBp = bp;
    }
    return nextLayouts;
  }, [layout]);

  useEffect(() => {
    currentLayoutRef.current = layout;
  }, [layout]);

  // ─── Layout updates ──────────────────────────────────────────────────────────

  const applyUpdatesLocally = useCallback(
    (updates: PreferenceUpdate[]) => {
      setPrefs((prev) => applyUpdatesToPreferenceMap(prev, updates));
    },
    []
  );

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleLayoutChange = useCallback((currentLayout: Layout) => {
    currentLayoutRef.current = currentLayout;
  }, []);

  const handleLayoutCommit = useCallback(
    async (currentLayout: Layout) => {
      currentLayoutRef.current = currentLayout;
      const updates = buildLayoutUpdates({ currentLayout, prefs, visibleWidgetMap });
      if (updates.length === 0) return;
      applyUpdatesLocally(updates);
      try {
        await persistPreferenceUpdates({ installedAppIds, updates });
        onCommit(updates);
      } catch (error: unknown) {
        console.error("Failed to persist widget layout changes", error);
        setPrefs(workspacePreferenceMap);
      }
    },
    [applyUpdatesLocally, installedAppIds, onCommit, prefs, visibleWidgetMap, workspacePreferenceMap]
  );

  const handleWidgetVisibilityChange = useCallback(
    async (widgetId: string, enabled: boolean) => {
      setBusyWidgetId(widgetId);

      const nextPlacement = enabled
        ? getNextWidgetPlacement(currentLayoutRef.current)
        : null;
      const updates: PreferenceUpdate[] = [
        {
          widget_id: widgetId,
          enabled,
          ...(nextPlacement ? { grid_x: nextPlacement.x, grid_y: nextPlacement.y } : {}),
        },
      ];
      applyUpdatesLocally(updates);
      try {
        await persistPreferenceUpdates({ installedAppIds, updates });
        onCommit(updates);
      } catch (error: unknown) {
        console.error("Failed to update widget visibility", error);
        setPrefs((prev) => {
          const next = new Map(prev);
          next.delete(widgetId);
          return next;
        });
      } finally {
        setBusyWidgetId(null);
      }
    },
    [applyUpdatesLocally, installedAppIds, onCommit]
  );

  const handleAutoRearrange = useCallback(
    async (widgets: ResolvedWidget[]) => {
      if (widgets.length === 0) return;
      const newLayout = autoRearrangeWidgets(widgets, prefs);
      currentLayoutRef.current = newLayout;
      const updates: PreferenceUpdate[] = newLayout.map((item) => ({
        widget_id: item.i,
        grid_x: item.x,
        grid_y: item.y,
      }));
      applyUpdatesLocally(updates);
      try {
        await persistPreferenceUpdates({ installedAppIds, updates });
        onCommit(updates);
      } catch (error: unknown) {
        console.error("Failed to auto-rearrange widgets", error);
        setPrefs(workspacePreferenceMap);
      }
    },
    [applyUpdatesLocally, installedAppIds, onCommit, prefs, workspacePreferenceMap]
  );

  return {
    containerRef,
    containerWidth,
    prefs,
    enabledWidgetIds,
    visibleWidgets,
    visibleWidgetMap,
    layout,
    responsiveLayouts,
    busyWidgetId,
    handleLayoutChange,
    handleLayoutCommit,
    handleWidgetVisibilityChange,
    handleAutoRearrange,
  };
}
export type { ResolvedWidget };
