/**
 * Lazy Loading App Registry
 *
 * Architecture:
 * - Không dùng eager: true - mỗi app được lazy load qua dynamic import
 * - Manifests được preload nhẹ (chỉ chứa metadata)
 * - Components chỉ load khi app được render
 */

import { lazy, type ComponentType, type LazyExoticComponent, createElement } from "react";
import type { FrontendAppDefinition, FrontendAppManifest } from "./types";
import type { DashboardWidgetProps } from "./types";

// Metadata interface nhẹ - chỉ chứa manifest, không có components
export interface AppMetadata {
  id: string;
  manifest: FrontendAppManifest;
  // Lazy loaders - functions return promises
  loadAppView: () => Promise<{ default: ComponentType }>;
  loadDashboardWidget: () => Promise<{ default: ComponentType<DashboardWidgetProps> }>;
}

// Registry chỉ chứa metadata, không chứa component instances
const metadataRegistry: Map<string, AppMetadata> = new Map();

// Cache cho lazy components - mỗi app chỉ tạo lazy component một lần
const appViewCache: Map<string, LazyExoticComponent<ComponentType>> = new Map();
const widgetCache: Map<string, LazyExoticComponent<ComponentType<DashboardWidgetProps>>> = new Map();

// Cache cho loaded components (đã prefetch)
const loadedAppViews: Map<string, ComponentType> = new Map();
const loadedWidgets: Map<string, ComponentType<DashboardWidgetProps>> = new Map();

/**
 * Register an app's metadata without loading its components.
 * Called at init time với thông tin từ backend.
 */
export function registerAppMetadata(
  id: string,
  manifest: FrontendAppManifest,
  loaders: {
    loadAppView: () => Promise<{ default: ComponentType }>;
    loadDashboardWidget: () => Promise<{ default: ComponentType<DashboardWidgetProps> }>;
  }
): void {
  metadataRegistry.set(id, {
    id,
    manifest,
    ...loaders,
  });
}

/**
 * Get metadata for an app (không load components).
 * Returns undefined nếu app chưa được register.
 */
export function getAppMetadata(appId: string): AppMetadata | undefined {
  return metadataRegistry.get(appId);
}

/**
 * Check if an app metadata exists.
 */
export function hasAppMetadata(appId: string): boolean {
  return metadataRegistry.has(appId);
}

/**
 * Get all registered app IDs.
 */
export function getRegisteredAppIds(): string[] {
  return Array.from(metadataRegistry.keys());
}

/**
 * Check if AppView đã được prefetch và load.
 */
export function isAppViewLoaded(appId: string): boolean {
  return loadedAppViews.has(appId);
}

/**
 * Get loaded AppView component (nếu đã prefetch).
 * Returns null nếu chưa load.
 */
export function getLoadedAppView(appId: string): ComponentType | null {
  return loadedAppViews.get(appId) ?? null;
}

/**
 * Check if Widget đã được prefetch và load.
 */
export function isWidgetLoaded(appId: string): boolean {
  return loadedWidgets.has(appId);
}

/**
 * Get loaded Widget component (nếu đã prefetch).
 */
export function getLoadedWidget(appId: string): ComponentType<DashboardWidgetProps> | null {
  return loadedWidgets.get(appId) ?? null;
}

/**
 * Mark app view as loaded (gọi từ prefetch khi load xong).
 */
export function markAppViewLoaded(appId: string, component: ComponentType): void {
  loadedAppViews.set(appId, component);
}

/**
 * Mark widget as loaded.
 */
export function markWidgetLoaded(appId: string, component: ComponentType<DashboardWidgetProps>): void {
  loadedWidgets.set(appId, component);
}

/**
 * Lazy load AppView component cho một app.
 * Returns React.lazy wrapper để dùng trong Suspense.
 * Lazy component được cache để tránh recreate mỗi lần.
 */
export function lazyLoadAppView(
  appId: string
): LazyExoticComponent<ComponentType> | null {
  // Check cache trước
  const cached = appViewCache.get(appId);
  if (cached) {
    return cached;
  }

  const metadata = metadataRegistry.get(appId);
  if (!metadata) {
    return null;
  }

  // Tạo lazy component mới và cache nó
  const LazyComponent = lazy(() =>
    metadata.loadAppView().then((result) => {
      // Lưu vào loaded cache để có thể dùng trực tiếp sau này
      loadedAppViews.set(appId, result.default);
      return result;
    }).catch(() => {
      // Return error component using createElement (no JSX in .ts file)
      return {
        default: () =>
          createElement(
            "div",
            { style: { padding: "2rem", color: "var(--color-danger)" } },
            `Failed to load ${appId} app view.`
          ),
      };
    })
  );

  appViewCache.set(appId, LazyComponent);
  return LazyComponent;
}

/**
 * Lazy load DashboardWidget component cho một app.
 * Lazy component được cache để tránh recreate mỗi lần.
 */
export function lazyLoadDashboardWidget(
  appId: string
): LazyExoticComponent<ComponentType<DashboardWidgetProps>> | null {
  // Check cache trước
  const cached = widgetCache.get(appId);
  if (cached) return cached;

  const metadata = metadataRegistry.get(appId);
  if (!metadata) return null;

  // Tạo lazy component mới và cache nó
  const LazyComponent = lazy(() =>
    metadata.loadDashboardWidget().then((result) => {
      // Lưu vào loaded cache
      loadedWidgets.set(appId, result.default);
      return result;
    }).catch(() => {
      return {
        default: () =>
          createElement(
            "div",
            { style: { padding: "1rem", color: "var(--color-danger)" } },
            "Widget failed to load."
          ),
      };
    })
  );

  widgetCache.set(appId, LazyComponent);
  return LazyComponent;
}

/**
 * Clear lazy component cache (useful for HMR or testing).
 */
export function clearLazyCache(appId?: string): void {
  if (appId) {
    appViewCache.delete(appId);
    widgetCache.delete(appId);
    loadedAppViews.delete(appId);
    loadedWidgets.delete(appId);
  } else {
    appViewCache.clear();
    widgetCache.clear();
    loadedAppViews.clear();
    loadedWidgets.clear();
  }
}

/**
 * Build lazy loaders cho một app từ dynamic import path.
 * Factory function để tạo loaders cho mỗi app.
 */
export function createAppLoaders(
  appId: string,
  importPath: string
): {
  loadAppView: () => Promise<{ default: ComponentType }>;
  loadDashboardWidget: () => Promise<{ default: ComponentType<DashboardWidgetProps> }>;
} {
  return {
    loadAppView: () =>
      import(/* @vite-ignore */ importPath).then((module) => ({
        default: module.default.AppView,
      })),
    loadDashboardWidget: () =>
      import(/* @vite-ignore */ importPath).then((module) => ({
        default: module.default.DashboardWidget,
      })),
  };
}
