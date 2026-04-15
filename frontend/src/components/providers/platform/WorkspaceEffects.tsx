import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { useRenderLoopDebug } from "@/lib/debug-render-loop";
import { useAuth } from "@/hooks/useAuth";
import {
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
  const installedApps = useInstalledApps();
  const widgetPreferences = useWidgetPreferences();
  const {
    hydrateWorkspace,
    isWorkspaceLoading,
    isWorkspaceRefreshing,
    refreshWorkspace,
    resetWorkspace,
  } = useWorkspaceStore(
    useShallow((state) => ({
      hydrateWorkspace: state.hydrateWorkspace,
      isWorkspaceLoading: state.isWorkspaceLoading,
      isWorkspaceRefreshing: state.isWorkspaceRefreshing,
      refreshWorkspace: state.refreshWorkspace,
      resetWorkspace: state.resetWorkspace,
    }))
  );

  const userId = user?.id ?? null;

  useRenderLoopDebug("WorkspaceEffects", {
    details: () => ({
      userId,
      installedApps: installedApps.length,
      widgetPreferences: widgetPreferences.length,
      isWorkspaceLoading,
      isWorkspaceRefreshing,
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

    void refreshWorkspace();
  }, [hydrateWorkspace, refreshWorkspace, resetWorkspace, userId]);

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

  return null;
}
