import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { useRenderLoopDebug } from "@/lib/debug-render-loop";
import { mutate as swrMutate } from "@/lib/swr";
import { createWidgetDataKey } from "@/lib/widget-data";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/providers/ToastProvider";
import {
  useInitialWidgetData,
  useInstalledApps,
  useWidgetPreferences,
  useWorkspaceStore,
} from "@/stores/platform/workspaceStore";

import { useAppActivation } from "../useAppActivation";
import {
  clearWorkspaceSnapshot,
  readWorkspaceSnapshot,
  writeWorkspaceSnapshot,
} from "../workspace-snapshot";

export function WorkspaceEffects() {
  const { user } = useAuth();
  const toast = useToast();
  const installedApps = useInstalledApps();
  const initialWidgetDataById = useInitialWidgetData();
  const widgetPreferences = useWidgetPreferences();
  const {
    hydrateWorkspace,
    isWorkspaceLoading,
    isWorkspaceRefreshing,
    refreshWorkspace,
    resetWorkspace,
    workspaceError,
  } = useWorkspaceStore(
    useShallow((state) => ({
      hydrateWorkspace: state.hydrateWorkspace,
      isWorkspaceLoading: state.isWorkspaceLoading,
      isWorkspaceRefreshing: state.isWorkspaceRefreshing,
      refreshWorkspace: state.refreshWorkspace,
      resetWorkspace: state.resetWorkspace,
      workspaceError: state.workspaceError,
    }))
  );

  const userId = user?.id ?? null;

  useRenderLoopDebug("WorkspaceEffects", {
    details: () => ({
      userId,
      installedApps: installedApps.length,
      initialWidgetData: Object.keys(initialWidgetDataById).length,
      widgetPreferences: widgetPreferences.length,
      isWorkspaceLoading,
      isWorkspaceRefreshing,
      workspaceError,
    }),
  });

  useAppActivation(installedApps);

  useEffect(() => {
    if (!userId) {
      resetWorkspace();
      clearWorkspaceSnapshot();
      return;
    }

    const snapshot = readWorkspaceSnapshot(userId);
    hydrateWorkspace(userId, snapshot);

    void refreshWorkspace().catch((error: unknown) => {
      console.error("Failed to bootstrap workspace", error);
    });
  }, [hydrateWorkspace, refreshWorkspace, resetWorkspace, userId]);

  useEffect(() => {
    if (!workspaceError) return;

    toast.error("Failed to refresh workspace", {
      description: workspaceError,
    });
  }, [toast, workspaceError]);

  useEffect(() => {
    for (const app of installedApps) {
      for (const widget of app.widgets ?? []) {
        const initialData = initialWidgetDataById[widget.id];
        if (initialData === undefined) continue;
        void swrMutate(createWidgetDataKey(app.id, widget.id), initialData, {
          populateCache: true,
          revalidate: false,
        });
      }
    }
  }, [initialWidgetDataById, installedApps]);

  useEffect(() => {
    if (!userId || isWorkspaceLoading) return;

    const workspaceSnapshot = {
      initial_widget_data: initialWidgetDataById,
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
  }, [initialWidgetDataById, installedApps, isWorkspaceLoading, userId, widgetPreferences]);

  return null;
}
