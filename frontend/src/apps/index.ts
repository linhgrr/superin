/**
 * App registry — thin re-export from platform lib.
 *
 * plugins/ can import from here (apps/ is the discovery hub,
 * not a plugin). Platform code uses @/lib/* directly.
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