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
 * Lazy load AppView component cho một app.
 * Returns React.lazy wrapper để dùng trong Suspense.
 */
export function lazyLoadAppView(
  appId: string
): LazyExoticComponent<ComponentType> | null {
  const metadata = metadataRegistry.get(appId);
  if (!metadata) return null;

  return lazy(() =>
    metadata.loadAppView().catch((error) => {
      console.error(`[LazyRegistry] Failed to load AppView for "${appId}":`, error);
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
}

/**
 * Lazy load DashboardWidget component cho một app.
 */
export function lazyLoadDashboardWidget(
  appId: string
): LazyExoticComponent<ComponentType<DashboardWidgetProps>> | null {
  const metadata = metadataRegistry.get(appId);
  if (!metadata) return null;

  return lazy(() =>
    metadata.loadDashboardWidget().catch((error) => {
      console.error(`[LazyRegistry] Failed to load DashboardWidget for "${appId}":`, error);
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
