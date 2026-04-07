/**
 * App discovery compatibility facade.
 *
 * `src/apps` is not a handwritten registry. This module only re-exports the
 * platform discovery/lazy-loading helpers so app code can import from a stable
 * app-local surface when needed.
 */
import { discoverAndRegisterApps, type AppMetadata } from "@/lib/discovery";
import type { DashboardWidgetProps } from "@/lib/types";
import {
  clearActiveApps,
  clearLazyCache,
  getAppMetadata,
  getLoadedAppView,
  getLoadedWidget,
  getRegisteredAppIds,
  hasAppMetadata,
  isAppActive,
  isAppViewLoaded,
  isWidgetLoaded,
  lazyLoadAppView,
  lazyLoadDashboardWidget,
  loadAppViewComponent,
  loadDashboardWidgetComponent,
  setActiveApps,
} from "@/lib/lazy-registry";
import {
  isAppPrefetched,
  prefetchApp,
  prefetchApps,
  prefetchAppAndWidget,
  prefetchHandlers,
  prefetchWidget,
  primeApp,
  primeAppAndWidget,
  primeWidget,
} from "@/lib/prefetch";

// Re-export all platform functions
export {
  discoverAndRegisterApps,
  type AppMetadata,
  clearActiveApps,
  clearLazyCache,
  getAppMetadata,
  getLoadedAppView,
  getLoadedWidget,
  getRegisteredAppIds,
  hasAppMetadata,
  isAppActive,
  isAppViewLoaded,
  isWidgetLoaded,
  lazyLoadAppView,
  lazyLoadDashboardWidget,
  loadAppViewComponent,
  loadDashboardWidgetComponent,
  setActiveApps,
  isAppPrefetched,
  prefetchApp,
  prefetchApps,
  prefetchAppAndWidget,
  prefetchHandlers,
  prefetchWidget,
  primeApp,
  primeAppAndWidget,
  primeWidget,
};

export type { DashboardWidgetProps };

/**
 * @deprecated Use getAppMetadata from @/lib/lazy-registry
 */
export function getLazyApp(_appId: string): null {
  return null;
}

/**
 * @deprecated Use hasAppMetadata from @/lib/lazy-registry
 */
export function hasFrontendApp(appId: string): boolean {
  return hasAppMetadata(appId);
}
