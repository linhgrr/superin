import { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { getWorkspaceBootstrap } from "@/api/workspace";
import { clearActiveApps } from "@/lib/lazy-registry";
import { mergePreferenceUpdates } from "@/pages/dashboard/preference-utils";
import type {
  AppCatalogEntry,
  AppRuntimeEntry,
  PreferenceUpdate,
  WidgetPreferenceSchema,
  WorkspaceBootstrap,
} from "@/types/generated";

interface WorkspaceEntities {
  installedAppOrder: string[];
  installedAppsById: Record<string, AppRuntimeEntry>;
  widgetPreferencesById: Record<string, WidgetPreferenceSchema>;
}

interface WorkspaceStoreState {
  installedAppIds: Set<string>;
  installedAppOrder: string[];
  installedAppsById: Record<string, AppRuntimeEntry>;
  isWorkspaceLoading: boolean;
  isWorkspaceRefreshing: boolean;
  refreshRequestId: number;
  sessionRevision: number;
  userId: string | null;
  widgetPreferencesById: Record<string, WidgetPreferenceSchema>;
  applyPreferenceUpdates: (updates: PreferenceUpdate[]) => void;
  hydrateWorkspace: (userId: string, snapshot: WorkspaceBootstrap | null) => void;
  internal_applyWorkspace: (workspace: WorkspaceBootstrap) => void;
  refreshWorkspace: () => Promise<void>;
  replaceWidgetPreferences: (preferences: WidgetPreferenceSchema[]) => void;
  resetWorkspace: () => void;
  setAppInstalled: (app: AppCatalogEntry, isInstalled: boolean) => void;
}

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

function toInstalledAppIds(installedApps: AppRuntimeEntry[]): Set<string> {
  return new Set(installedApps.map((app) => app.id));
}

function normalizeWorkspaceEntities(
  installedApps: AppRuntimeEntry[],
  widgetPreferences: WidgetPreferenceSchema[]
): WorkspaceEntities {
  return {
    installedAppOrder: installedApps.map((app) => app.id),
    installedAppsById: indexInstalledApps(installedApps),
    widgetPreferencesById: indexWidgetPreferences(widgetPreferences),
  };
}

function indexInstalledApps(installedApps: AppRuntimeEntry[]): Record<string, AppRuntimeEntry> {
  const installedAppsById: Record<string, AppRuntimeEntry> = {};

  for (const app of installedApps) {
    installedAppsById[app.id] = app;
  }

  return installedAppsById;
}

function indexWidgetPreferences(
  widgetPreferences: WidgetPreferenceSchema[]
): Record<string, WidgetPreferenceSchema> {
  const widgetPreferencesById: Record<string, WidgetPreferenceSchema> = {};

  for (const preference of widgetPreferences) {
    widgetPreferencesById[preference.widget_id] = preference;
  }

  return widgetPreferencesById;
}

function getInstalledAppsSnapshot(
  state: Pick<WorkspaceStoreState, "installedAppOrder" | "installedAppsById">
) {
  return state.installedAppOrder
    .map((appId) => state.installedAppsById[appId])
    .filter((app): app is AppRuntimeEntry => Boolean(app));
}

function getWidgetPreferencesSnapshot(
  state: Pick<WorkspaceStoreState, "widgetPreferencesById">
) {
  return Object.values(state.widgetPreferencesById);
}

const initialState = {
  installedAppIds: new Set<string>(),
  installedAppOrder: [],
  installedAppsById: {},
  isWorkspaceLoading: true,
  isWorkspaceRefreshing: false,
  refreshRequestId: 0,
  sessionRevision: 0,
  userId: null,
  widgetPreferencesById: {},
} satisfies Pick<
  WorkspaceStoreState,
  | "installedAppIds"
  | "installedAppOrder"
  | "installedAppsById"
  | "isWorkspaceLoading"
  | "isWorkspaceRefreshing"
  | "refreshRequestId"
  | "sessionRevision"
  | "userId"
  | "widgetPreferencesById"
>;

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  ...initialState,
  applyPreferenceUpdates: (updates) => {
    set((state) => {
      const widgetPreferences = mergePreferenceUpdates(
        getWidgetPreferencesSnapshot(state),
        updates
      );

      return normalizeWorkspaceEntities(getInstalledAppsSnapshot(state), widgetPreferences);
    });
  },
  hydrateWorkspace: (userId, snapshot) => {
    const nextSessionRevision = get().sessionRevision + 1;

    if (!snapshot) {
      set({
        installedAppIds: new Set<string>(),
        installedAppOrder: [],
        installedAppsById: {},
        isWorkspaceLoading: true,
        isWorkspaceRefreshing: false,
        sessionRevision: nextSessionRevision,
        userId,
        widgetPreferencesById: {},
      });
      return;
    }

    get().internal_applyWorkspace(snapshot);
    set({
      isWorkspaceLoading: false,
      isWorkspaceRefreshing: false,
      sessionRevision: nextSessionRevision,
      userId,
    });
  },
  internal_applyWorkspace: (workspace) => {
    const installedApps = workspace.installed_apps ?? [];
    const widgetPreferences = workspace.widget_preferences ?? [];

    set({
      installedAppIds: toInstalledAppIds(installedApps),
      ...normalizeWorkspaceEntities(installedApps, widgetPreferences),
    });
  },
  refreshWorkspace: async () => {
    const userId = get().userId;
    const sessionRevision = get().sessionRevision;

    if (!userId) {
      get().resetWorkspace();
      return;
    }

    const requestId = get().refreshRequestId + 1;
    set({
      isWorkspaceRefreshing: true,
      refreshRequestId: requestId,
    });

    try {
      const workspace = await getWorkspaceBootstrap();
      if (
        get().refreshRequestId !== requestId ||
        get().sessionRevision !== sessionRevision ||
        get().userId !== userId
      ) {
        return;
      }

      get().internal_applyWorkspace(workspace);
    } finally {
      if (
        get().refreshRequestId === requestId &&
        get().sessionRevision === sessionRevision &&
        get().userId === userId
      ) {
        set({
          isWorkspaceLoading: false,
          isWorkspaceRefreshing: false,
        });
      }
    }
  },
  replaceWidgetPreferences: (preferences) => {
    set({
      widgetPreferencesById: indexWidgetPreferences(preferences),
    });
  },
  resetWorkspace: () => {
    clearActiveApps();
    set({
      ...initialState,
      isWorkspaceLoading: false,
      sessionRevision: get().sessionRevision + 1,
    });
  },
  setAppInstalled: (app, isInstalled) => {
    const runtimeApp = toRuntimeApp(app);

    set((state) => {
      const installedApps = getInstalledAppsSnapshot(state);
      const widgetPreferences = getWidgetPreferencesSnapshot(state);
      const nextInstalledApps = isInstalled
        ? state.installedAppIds.has(app.id)
          ? installedApps.map((entry) => (entry.id === app.id ? runtimeApp : entry))
          : [...installedApps, runtimeApp]
        : installedApps.filter((entry) => entry.id !== app.id);

      const nextPreferences = new Map(
        widgetPreferences.map((pref) => [pref.widget_id, pref] as const)
      );

      if (isInstalled) {
        for (const [index, widget] of (app.widgets ?? []).entries()) {
          if (nextPreferences.has(widget.id)) continue;

          nextPreferences.set(widget.id, {
            _id: null,
            user_id: state.userId ?? "",
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
      } else {
        for (const pref of widgetPreferences) {
          if (pref.app_id === app.id) {
            nextPreferences.delete(pref.widget_id);
          }
        }
      }

      return {
        installedAppIds: toInstalledAppIds(nextInstalledApps),
        ...normalizeWorkspaceEntities(nextInstalledApps, Array.from(nextPreferences.values())),
      };
    });
  },
}));

export const workspaceSelectors = {
  installedAppIds: (state: WorkspaceStoreState) => state.installedAppIds,
  isWorkspaceLoading: (state: WorkspaceStoreState) => state.isWorkspaceLoading,
  isWorkspaceRefreshing: (state: WorkspaceStoreState) => state.isWorkspaceRefreshing,
  refreshWorkspace: (state: WorkspaceStoreState) => state.refreshWorkspace,
  applyPreferenceUpdates: (state: WorkspaceStoreState) => state.applyPreferenceUpdates,
  hydrateWorkspace: (state: WorkspaceStoreState) => state.hydrateWorkspace,
  replaceWidgetPreferences: (state: WorkspaceStoreState) => state.replaceWidgetPreferences,
  resetWorkspace: (state: WorkspaceStoreState) => state.resetWorkspace,
  setAppInstalled: (state: WorkspaceStoreState) => state.setAppInstalled,
} as const;

export type WorkspaceStoreSlice = Pick<
  WorkspaceStoreState,
  | "installedAppIds"
  | "isWorkspaceLoading"
  | "isWorkspaceRefreshing"
  | "refreshWorkspace"
  | "setAppInstalled"
  | "applyPreferenceUpdates"
  | "replaceWidgetPreferences"
> & {
  installedApps: AppRuntimeEntry[];
  widgetPreferences: WidgetPreferenceSchema[];
};

export function useInstalledApps(): AppRuntimeEntry[] {
  const { installedAppOrder, installedAppsById } = useWorkspaceStore(
    useShallow((state) => ({
      installedAppOrder: state.installedAppOrder,
      installedAppsById: state.installedAppsById,
    }))
  );

  return useMemo(
    () => getInstalledAppsSnapshot({ installedAppOrder, installedAppsById }),
    [installedAppOrder, installedAppsById]
  );
}

export function useWidgetPreferences(): WidgetPreferenceSchema[] {
  const widgetPreferencesById = useWorkspaceStore((state) => state.widgetPreferencesById);

  return useMemo(
    () => getWidgetPreferencesSnapshot({ widgetPreferencesById }),
    [widgetPreferencesById]
  );
}
