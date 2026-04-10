/**
 * useAppActivation — manages lazy-registry activation and icon preloading.
 */

import { useEffect } from "react";

import { clearActiveApps, setActiveApps } from "@/lib/lazy-registry";
import { preloadIcons } from "@/lib/icon-resolver";
import { prefetchApps, primeAppAndWidget } from "@/lib/prefetch";
import type { AppRuntimeEntry } from "@/types/generated";

export function useAppActivation(installedApps: AppRuntimeEntry[]) {
  // Sync active app IDs to lazy-registry
  useEffect(() => {
    setActiveApps(installedApps.map((app) => app.id));
  }, [installedApps]);

  // Preload icons for all installed apps
  useEffect(() => {
    const iconNames = installedApps.flatMap((app) => [
      app.icon,
      ...(app.widgets ?? []).map((widget) => widget.icon),
    ]);
    if (iconNames.length === 0) return;

    const handle = window.setTimeout(() => {
      preloadIcons(iconNames.filter((name): name is string => Boolean(name)));
    }, 1);
    return () => window.clearTimeout(handle);
  }, [installedApps]);

  // Prefetch app chunks: top-3 eagerly, rest lazily
  useEffect(() => {
    if (installedApps.length === 0) return;

    const prioritizedAppIds = [...installedApps]
      .sort((left, right) => {
        const rightCount = (right.widgets ?? []).length;
        const leftCount = (left.widgets ?? []).length;
        return rightCount - leftCount;
      })
      .map((app) => app.id);

    const eagerAppIds = prioritizedAppIds.slice(0, 3);
    const idleAppIds = prioritizedAppIds.slice(3);

    const eagerHandles = eagerAppIds.map((appId, index) =>
      window.setTimeout(() => primeAppAndWidget(appId), index * 60)
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
}

export { clearActiveApps };