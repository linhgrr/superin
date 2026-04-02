import type { FrontendAppDefinition, FrontendAppManifest } from "./types";
import type { DashboardWidgetProps } from "./types";
import type { LazyExoticComponent, ComponentType } from "react";
import {
  lazyLoadAppView,
  lazyLoadDashboardWidget,
  getAppMetadata,
  hasAppMetadata,
  getRegisteredAppIds,
  isAppViewLoaded,
  getLoadedAppView,
  isWidgetLoaded,
  getLoadedWidget,
  type AppMetadata,
} from "./lazy-registry";
import { discoverAndRegisterApps } from "./discovery";

// Re-export tất cả từ lazy-registry và discovery
export {
  lazyLoadAppView,
  lazyLoadDashboardWidget,
  getAppMetadata,
  hasAppMetadata,
  getRegisteredAppIds,
  discoverAndRegisterApps,
  isAppViewLoaded,
  getLoadedAppView,
  isWidgetLoaded,
  getLoadedWidget,
  type AppMetadata,
};

// Re-export prefetch utilities
export {
  prefetchApp,
  prefetchWidget,
  prefetchAppAndWidget,
  prefetchHandlers,
  prefetchApps,
  isAppPrefetched,
} from "./prefetch";

/**
 * Kết hợp metadata + lazy component cho backwards compatibility.
 * Interface này giống FrontendAppDefinition nhưng với lazy components.
 */
export interface LazyAppDefinition {
  manifest: FrontendAppManifest;
  AppView: LazyExoticComponent<ComponentType> | null;
  DashboardWidget: LazyExoticComponent<ComponentType<DashboardWidgetProps>> | null;
}

/**
 * Lấy lazy app definition cho một app ID.
 * Returns null nếu app chưa được register.
 */
export function getLazyApp(appId: string): LazyAppDefinition | null {
  const metadata = getAppMetadata(appId);
  if (!metadata) return null;

  return {
    manifest: metadata.manifest,
    AppView: lazyLoadAppView(appId),
    DashboardWidget: lazyLoadDashboardWidget(appId),
  };
}

/**
 * Check if a lazy app is available (metadata registered).
 */
export function hasLazyApp(appId: string): boolean {
  return hasAppMetadata(appId);
}

/**
 * Legacy compatibility - giữ lại để các file cũ không break.
 * @deprecated Dùng discoverAndRegisterApps() và getLazyApp() thay thế
 */
export const FRONTEND_APPS: Record<string, never> = {};

/**
 * Legacy compatibility.
 * @deprecated Dùng getLazyApp() thay thế
 */
export function getFrontendApp(_appId: string): undefined {
  return undefined;
}

/**
 * Legacy compatibility.
 * @deprecated Dùng hasLazyApp() thay thế
 */
export function hasFrontendApp(appId: string): boolean {
  return hasLazyApp(appId);
}
