import { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { getWorkspaceBootstrap } from "@/api/workspace";
import type {
  AppCatalogEntry,
  AppRuntimeEntry,
  PreferenceUpdate,
  WidgetPreferenceSchema,
  WorkspaceBootstrap,
} from "@/types/generated";
import {
  createHydratedWorkspaceState,
  createResetWorkspaceState,
  createWorkspaceEntitiesState,
  getInstalledAppsSnapshot,
  getWidgetPreferencesSnapshot,
  getWorkspaceErrorMessage,
  indexWidgetPreferences,
  initialWorkspaceState,
  isActiveRefreshRequest,
  reduceInstalledAppChange,
  reducePreferenceUpdates,
} from "./workspaceState";

interface WorkspaceStoreState {
  installedAppIds: Set<string>;
  installedAppOrder: string[];
  installedAppsById: Record<string, AppRuntimeEntry>;
  workspaceError: string | null;
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

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  ...initialWorkspaceState,
  applyPreferenceUpdates: (updates) => {
    set((state) => reducePreferenceUpdates(state, updates));
  },
  hydrateWorkspace: (userId, snapshot) => {
    const nextSessionRevision = get().sessionRevision + 1;
    set(createHydratedWorkspaceState(userId, nextSessionRevision, snapshot));
  },
  internal_applyWorkspace: (workspace) => {
    set({
      ...createWorkspaceEntitiesState(
        workspace.installed_apps ?? [],
        workspace.widget_preferences ?? []
      ),
      workspaceError: null,
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
      workspaceError: null,
    });

    try {
      const workspace = await getWorkspaceBootstrap();
      if (!isActiveRefreshRequest(get(), requestId, sessionRevision, userId)) {
        return;
      }

      get().internal_applyWorkspace(workspace);
    } catch (error) {
      if (isActiveRefreshRequest(get(), requestId, sessionRevision, userId)) {
        set({
          workspaceError: getWorkspaceErrorMessage(error),
        });
      }

      throw error;
    } finally {
      if (isActiveRefreshRequest(get(), requestId, sessionRevision, userId)) {
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
    set(createResetWorkspaceState(get().sessionRevision + 1));
  },
  setAppInstalled: (app, isInstalled) => {
    set((state) => reduceInstalledAppChange(state, app, isInstalled));
  },
}));

export const workspaceSelectors = {
  installedAppIds: (state: WorkspaceStoreState) => state.installedAppIds,
  isWorkspaceLoading: (state: WorkspaceStoreState) => state.isWorkspaceLoading,
  isWorkspaceRefreshing: (state: WorkspaceStoreState) => state.isWorkspaceRefreshing,
  workspaceError: (state: WorkspaceStoreState) => state.workspaceError,
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
