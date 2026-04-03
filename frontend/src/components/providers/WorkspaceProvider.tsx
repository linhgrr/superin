import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getWorkspaceBootstrap } from "@/api/workspace";
import { clearActiveApps, discoverAndRegisterApps, prefetchApps, primeAppAndWidget, setActiveApps } from "@/apps";
import { STORAGE_KEYS } from "@/constants";
import { useAuth } from "@/hooks/useAuth";
import { preloadIcons } from "@/lib/icon-resolver";
import type {
  AppCatalogEntry,
  AppRuntimeEntry,
  PreferenceUpdate,
  WidgetPreferenceSchema,
  WorkspaceBootstrap,
} from "@/types/generated/api";

interface PersistedWorkspaceSnapshot {
  storedAt: number;
  userId: string;
  version: 1;
  workspace: WorkspaceBootstrap;
}

interface WorkspaceContextValue {
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

const WORKSPACE_CACHE_VERSION = 1;

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function toRuntimeApp(app: AppCatalogEntry): AppRuntimeEntry {
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

function readWorkspaceSnapshot(userId: string): WorkspaceBootstrap | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.WORKSPACE_SNAPSHOT);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedWorkspaceSnapshot;
    if (
      parsed.version !== WORKSPACE_CACHE_VERSION ||
      parsed.userId !== userId ||
      !parsed.workspace
    ) {
      return null;
    }

    return parsed.workspace;
  } catch (error: unknown) {
    console.error("Failed to read workspace snapshot", error);
    return null;
  }
}

function writeWorkspaceSnapshot(userId: string, workspace: WorkspaceBootstrap): void {
  try {
    const payload: PersistedWorkspaceSnapshot = {
      userId,
      version: WORKSPACE_CACHE_VERSION,
      storedAt: Date.now(),
      workspace,
    };
    sessionStorage.setItem(STORAGE_KEYS.WORKSPACE_SNAPSHOT, JSON.stringify(payload));
  } catch (error: unknown) {
    console.error("Failed to write workspace snapshot", error);
  }
}

function clearWorkspaceSnapshot(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.WORKSPACE_SNAPSHOT);
  } catch (error: unknown) {
    console.error("Failed to clear workspace snapshot", error);
  }
}

function mergePreferenceUpdates(
  current: WidgetPreferenceSchema[],
  updates: PreferenceUpdate[]
): WidgetPreferenceSchema[] {
  const next = new Map(current.map((pref) => [pref.widget_id, pref] as const));

  for (const update of updates) {
    const existing = next.get(update.widget_id);
    const appId = existing?.app_id ?? update.widget_id.split(".")[0] ?? "";

    next.set(update.widget_id, {
      _id: existing?._id ?? null,
      user_id: existing?.user_id ?? "",
      widget_id: update.widget_id,
      app_id: appId,
      enabled: update.enabled ?? existing?.enabled ?? false,
      sort_order: update.sort_order ?? existing?.sort_order ?? 0,
      config: update.config ?? existing?.config ?? {},
      size_w: update.size_w ?? existing?.size_w ?? null,
      size_h: update.size_h ?? existing?.size_h ?? null,
    });
  }

  return Array.from(next.values());
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [installedApps, setInstalledApps] = useState<AppRuntimeEntry[]>([]);
  const [widgetPreferences, setWidgetPreferences] = useState<WidgetPreferenceSchema[]>([]);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isWorkspaceRefreshing, setIsWorkspaceRefreshing] = useState(false);
  const refreshRequestIdRef = useRef(0);

  const userId = user?.id ?? null;

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
      if (refreshRequestIdRef.current !== requestId) {
        return;
      }
      applyWorkspace(workspace);
      writeWorkspaceSnapshot(userId, workspace);
    } finally {
      if (refreshRequestIdRef.current === requestId) {
        setIsWorkspaceLoading(false);
        setIsWorkspaceRefreshing(false);
      }
    }
  }, [applyWorkspace, userId]);

  useEffect(() => {
    discoverAndRegisterApps();
  }, []);

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

  useEffect(() => {
    setActiveApps(installedApps.map((app) => app.id));
  }, [installedApps]);

  useEffect(() => {
    const iconNames = installedApps.flatMap((app) => [
      app.icon,
      ...app.widgets.map((widget) => widget.icon),
    ]);
    if (iconNames.length === 0) {
      return;
    }

    let cancelScheduled = () => {};
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(() => {
        preloadIcons(iconNames.filter((name): name is string => Boolean(name)));
      });
      cancelScheduled = () => window.cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(() => {
        preloadIcons(iconNames.filter((name): name is string => Boolean(name)));
      }, 1);
      cancelScheduled = () => window.clearTimeout(handle);
    }

    return () => {
      cancelScheduled();
    };
  }, [installedApps]);

  useEffect(() => {
    if (installedApps.length === 0) {
      return;
    }

    const prioritizedAppIds = [...installedApps]
      .sort((left, right) => {
        const rightCount = right.widgets.length;
        const leftCount = left.widgets.length;
        return rightCount - leftCount;
      })
      .map((app) => app.id);

    const eagerAppIds = prioritizedAppIds.slice(0, 3);
    const idleAppIds = prioritizedAppIds.slice(3);
    const eagerHandles = eagerAppIds.map((appId, index) =>
      window.setTimeout(() => {
        primeAppAndWidget(appId);
      }, index * 60)
    );
    let cancelIdlePrefetch = () => {};
    const idleHandle = window.setTimeout(() => {
      cancelIdlePrefetch = prefetchApps(idleAppIds);
    }, eagerAppIds.length > 0 ? 250 : 0);

    return () => {
      eagerHandles.forEach((handle) => window.clearTimeout(handle));
      window.clearTimeout(idleHandle);
      cancelIdlePrefetch();
    };
  }, [installedApps]);

  const setAppInstalled = useCallback((app: AppCatalogEntry, isInstalled: boolean) => {
    const runtimeApp = toRuntimeApp(app);

    setInstalledApps((prev) => {
      if (isInstalled) {
        const existing = prev.find((entry) => entry.id === app.id);
        if (existing) {
          return prev.map((entry) => (entry.id === app.id ? runtimeApp : entry));
        }
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
              config: {},
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

  useEffect(() => {
    if (!userId || isWorkspaceLoading) {
      return;
    }

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

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  }
  return context;
}
