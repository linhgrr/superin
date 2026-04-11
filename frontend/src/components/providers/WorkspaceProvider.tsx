import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getWorkspaceBootstrap } from "@/api/workspace";
import { discoverAndRegisterApps } from "@/lib/discovery";
import { useRenderLoopDebug } from "@/lib/debug-render-loop";
import { clearActiveApps } from "@/lib/lazy-registry";
import { useAuth } from "@/hooks/useAuth";
import type {
  AppCatalogEntry,
  AppRuntimeEntry,
  PreferenceUpdate,
  WidgetPreferenceSchema,
  WorkspaceBootstrap,
} from "@/types/generated";

import { useAppActivation } from "./useAppActivation";
import { clearWorkspaceSnapshot, readWorkspaceSnapshot, writeWorkspaceSnapshot } from "./workspace-snapshot";
import { WorkspaceContext } from "./workspace-context";
import { mergePreferenceUpdates } from "@/pages/dashboard/preference-utils";

export interface WorkspaceContextValue {
  installedApps: AppRuntimeEntry[];
  widgetPreferences: WidgetPreferenceSchema[];
  installedAppIds: Set<string>;
  isWorkspaceLoading: boolean;
  isWorkspaceRefreshing: boolean;
  isReady: boolean;
  refreshWorkspace: () => Promise<void>;
  setAppInstalled: (app: AppCatalogEntry, isInstalled: boolean) => void;
  applyPreferenceUpdates: (updates: PreferenceUpdate[]) => void;
  replaceWidgetPreferences: (preferences: WidgetPreferenceSchema[]) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export function toRuntimeApp(app: AppCatalogEntry): AppRuntimeEntry {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    icon: app.icon,
    color: app.color,
    category: app.category,
    version: app.version,
    author: app.author,
    widgets: app.widgets ?? [],
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [installedApps, setInstalledApps] = useState<AppRuntimeEntry[]>([]);
  const [widgetPreferences, setWidgetPreferences] = useState<WidgetPreferenceSchema[]>([]);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isWorkspaceRefreshing, setIsWorkspaceRefreshing] = useState(false);
  const refreshRequestIdRef = useRef(0);

  const userId = user?.id ?? null;

  useRenderLoopDebug("WorkspaceProvider", {
    details: () => ({
      userId,
      installedApps: installedApps.length,
      widgetPreferences: widgetPreferences.length,
      isWorkspaceLoading,
      isWorkspaceRefreshing,
    }),
  });

  // ─── App activation, icon preload, prefetch (extracted) ────────────────────
  useAppActivation(installedApps);

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  const applyWorkspace = useCallback((workspace: WorkspaceBootstrap) => {
    setInstalledApps(workspace.installed_apps ?? []);
    setWidgetPreferences(workspace.widget_preferences ?? []);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    if (!userId) {
      refreshRequestIdRef.current += 1;
      setInstalledApps([]);
      setWidgetPreferences([]);
      setIsWorkspaceLoading(false);
      setIsWorkspaceRefreshing(false);
      clearWorkspaceSnapshot();
      return;
    }

    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    setIsWorkspaceRefreshing(true);

    try {
      const workspace = await getWorkspaceBootstrap();
      if (refreshRequestIdRef.current !== requestId) return;
      applyWorkspace(workspace);
      writeWorkspaceSnapshot(userId, workspace);
    } finally {
      if (refreshRequestIdRef.current === requestId) {
        setIsWorkspaceLoading(false);
        setIsWorkspaceRefreshing(false);
      }
    }
  }, [applyWorkspace, userId]);

  // Register apps on mount
  useEffect(() => {
    discoverAndRegisterApps();
  }, []);

  // Auth-dependent lifecycle
  useEffect(() => {
    if (!userId) {
      refreshRequestIdRef.current += 1;
      setInstalledApps([]);
      setWidgetPreferences([]);
      setIsWorkspaceLoading(false);
      setIsWorkspaceRefreshing(false);
      clearWorkspaceSnapshot();
      clearActiveApps();
      return;
    }

    const snapshot = readWorkspaceSnapshot(userId);
    if (snapshot) {
      applyWorkspace(snapshot);
      setIsWorkspaceLoading(false);
    } else {
      setInstalledApps([]);
      setWidgetPreferences([]);
      setIsWorkspaceLoading(true);
    }

    void refreshWorkspace();
  }, [applyWorkspace, refreshWorkspace, userId]);

  // ─── App install/uninstall ──────────────────────────────────────────────────

  const setAppInstalled = useCallback((app: AppCatalogEntry, isInstalled: boolean) => {
    const runtimeApp = toRuntimeApp(app);

    setInstalledApps((prev) => {
      if (isInstalled) {
        const existing = prev.find((entry) => entry.id === app.id);
        if (existing) return prev.map((entry) => (entry.id === app.id ? runtimeApp : entry));
        return [...prev, runtimeApp];
      }
      return prev.filter((entry) => entry.id !== app.id);
    });

    setWidgetPreferences((prev) => {
      const next = new Map(prev.map((pref) => [pref.widget_id, pref] as const));
      if (isInstalled) {
        for (const [index, widget] of (app.widgets ?? []).entries()) {
          if (!next.has(widget.id)) {
            next.set(widget.id, {
              _id: null,
              user_id: userId ?? "",
              widget_id: widget.id,
              app_id: app.id,
              enabled: true,
              sort_order: index,
              grid_x: 0,
              grid_y: index * 2,
              size_w: null,
              size_h: null,
            });
          }
        }
      }
      return Array.from(next.values());
    });
  }, [userId]);

  const applyPreferenceUpdates = useCallback((updates: PreferenceUpdate[]) => {
    setWidgetPreferences((current) => mergePreferenceUpdates(current, updates));
  }, []);

  const replaceWidgetPreferences = useCallback((preferences: WidgetPreferenceSchema[]) => {
    setWidgetPreferences(preferences);
  }, []);

  // ─── Persistence ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId || isWorkspaceLoading) return;

    const workspaceSnapshot = {
      installed_apps: installedApps,
      widget_preferences: widgetPreferences,
    };
    let cancelScheduled = () => {};
    const timeoutId = window.setTimeout(() => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        const handle = window.requestIdleCallback(() => {
          writeWorkspaceSnapshot(userId, workspaceSnapshot);
        });
        cancelScheduled = () => window.cancelIdleCallback(handle);
        return;
      }
      writeWorkspaceSnapshot(userId, workspaceSnapshot);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      cancelScheduled();
    };
  }, [installedApps, isWorkspaceLoading, userId, widgetPreferences]);

  // ─── Context value ──────────────────────────────────────────────────────────

  const value = useMemo<WorkspaceContextValue>(() => ({
    installedApps,
    widgetPreferences,
    installedAppIds: new Set(installedApps.map((app) => app.id)),
    isWorkspaceLoading,
    isWorkspaceRefreshing,
    isReady: !isWorkspaceLoading,
    refreshWorkspace,
    setAppInstalled,
    applyPreferenceUpdates,
    replaceWidgetPreferences,
  }), [
    applyPreferenceUpdates,
    installedApps,
    isWorkspaceLoading,
    isWorkspaceRefreshing,
    replaceWidgetPreferences,
    refreshWorkspace,
    setAppInstalled,
    widgetPreferences,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
