/**
 * Lazy loading registry for app-local frontend bundles.
 *
 * The platform only discovers available loaders from app folders.
 * Installed/runtime metadata comes from the backend workspace bootstrap.
 */

import { createElement, lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { DashboardWidgetProps } from "./types";

export interface AppMetadata {
  id: string;
  loadAppView: () => Promise<{ default: ComponentType }>;
  loadDashboardWidget: () => Promise<{ default: ComponentType<DashboardWidgetProps> }>;
}

type AppModule = {
  default: {
    AppView: ComponentType;
    DashboardWidget: ComponentType<DashboardWidgetProps>;
  };
};

const metadataRegistry = new Map<string, AppMetadata>();
const activeAppIds = new Set<string>();

const appViewCache = new Map<string, LazyExoticComponent<ComponentType>>();
const widgetCache = new Map<string, LazyExoticComponent<ComponentType<DashboardWidgetProps>>>();
const loadedAppViews = new Map<string, ComponentType>();
const loadedWidgets = new Map<string, ComponentType<DashboardWidgetProps>>();
const appViewLoadPromises = new Map<string, Promise<ComponentType | null>>();
const widgetLoadPromises = new Map<string, Promise<ComponentType<DashboardWidgetProps> | null>>();

function createAppErrorComponent(appId: string): ComponentType {
  return () =>
    createElement(
      "div",
      { style: { padding: "2rem", color: "var(--color-danger)" } },
      `Failed to load ${appId} app view.`
    );
}

function createWidgetErrorComponent(): ComponentType<DashboardWidgetProps> {
  return () =>
    createElement(
      "div",
      { style: { padding: "1rem", color: "var(--color-danger)" } },
      "Widget failed to load."
    );
}

function createAppLoaders(loader: () => Promise<AppModule>) {
  return {
    loadAppView: () =>
      loader().then((module) => ({
        default: module.default.AppView,
      })),
    loadDashboardWidget: () =>
      loader().then((module) => ({
        default: module.default.DashboardWidget,
      })),
  };
}

export function registerAppMetadata(
  id: string,
  loaders: {
    loadAppView: () => Promise<{ default: ComponentType }>;
    loadDashboardWidget: () => Promise<{ default: ComponentType<DashboardWidgetProps> }>;
  }
): void {
  metadataRegistry.set(id, {
    id,
    ...loaders,
  });
}

export function registerAvailableApps(loadersByPath: Record<string, () => Promise<AppModule>>): AppMetadata[] {
  const registeredApps: AppMetadata[] = [];

  for (const [path, loader] of Object.entries(loadersByPath)) {
    const match = path.match(/^\.\/([^/]+)\/index\.ts$/);
    if (!match) {
      continue;
    }

    const appId = match[1];
    if (metadataRegistry.has(appId)) {
      const existing = metadataRegistry.get(appId);
      if (existing) {
        registeredApps.push(existing);
      }
      continue;
    }

    const appLoaders = createAppLoaders(loader);
    registerAppMetadata(appId, appLoaders);
    registeredApps.push({
      id: appId,
      ...appLoaders,
    });
  }

  return registeredApps;
}

export function setActiveApps(appIds: Iterable<string>): void {
  activeAppIds.clear();
  for (const appId of appIds) {
    if (metadataRegistry.has(appId)) {
      activeAppIds.add(appId);
    }
  }
}

export function clearActiveApps(): void {
  activeAppIds.clear();
}

export function isAppActive(appId: string): boolean {
  return activeAppIds.has(appId);
}

export function getAppMetadata(appId: string): AppMetadata | undefined {
  return metadataRegistry.get(appId);
}

export function hasAppMetadata(appId: string): boolean {
  return metadataRegistry.has(appId);
}

export function getRegisteredAppIds(): string[] {
  return Array.from(metadataRegistry.keys());
}

export function isAppViewLoaded(appId: string): boolean {
  return activeAppIds.has(appId) && loadedAppViews.has(appId);
}

export function getLoadedAppView(appId: string): ComponentType | null {
  if (!activeAppIds.has(appId)) {
    return null;
  }
  return loadedAppViews.get(appId) ?? null;
}

export function isWidgetLoaded(appId: string): boolean {
  return activeAppIds.has(appId) && loadedWidgets.has(appId);
}

export function getLoadedWidget(appId: string): ComponentType<DashboardWidgetProps> | null {
  if (!activeAppIds.has(appId)) {
    return null;
  }
  return loadedWidgets.get(appId) ?? null;
}

export function markAppViewLoaded(appId: string, component: ComponentType): void {
  loadedAppViews.set(appId, component);
}

export function markWidgetLoaded(appId: string, component: ComponentType<DashboardWidgetProps>): void {
  loadedWidgets.set(appId, component);
}

export async function loadAppViewComponent(appId: string): Promise<ComponentType | null> {
  if (!activeAppIds.has(appId)) {
    return null;
  }

  const loaded = loadedAppViews.get(appId);
  if (loaded) {
    return loaded;
  }

  const inflight = appViewLoadPromises.get(appId);
  if (inflight) {
    return inflight;
  }

  const metadata = metadataRegistry.get(appId);
  if (!metadata) {
    return null;
  }

  const promise = metadata
    .loadAppView()
    .then((result) => {
      loadedAppViews.set(appId, result.default);
      return result.default;
    })
    .catch(() => null)
    .finally(() => {
      appViewLoadPromises.delete(appId);
    });

  appViewLoadPromises.set(appId, promise);
  return promise;
}

export async function loadDashboardWidgetComponent(
  appId: string
): Promise<ComponentType<DashboardWidgetProps> | null> {
  if (!activeAppIds.has(appId)) {
    return null;
  }

  const loaded = loadedWidgets.get(appId);
  if (loaded) {
    return loaded;
  }

  const inflight = widgetLoadPromises.get(appId);
  if (inflight) {
    return inflight;
  }

  const metadata = metadataRegistry.get(appId);
  if (!metadata) {
    return null;
  }

  const promise = metadata
    .loadDashboardWidget()
    .then((result) => {
      loadedWidgets.set(appId, result.default);
      return result.default;
    })
    .catch(() => null)
    .finally(() => {
      widgetLoadPromises.delete(appId);
    });

  widgetLoadPromises.set(appId, promise);
  return promise;
}

export function lazyLoadAppView(appId: string): LazyExoticComponent<ComponentType> | null {
  if (!activeAppIds.has(appId)) {
    return null;
  }

  const cached = appViewCache.get(appId);
  if (cached) {
    return cached;
  }

  const metadata = metadataRegistry.get(appId);
  if (!metadata) {
    return null;
  }

  const LazyComponent = lazy(async () => {
    const component = await loadAppViewComponent(appId);
    return { default: component ?? createAppErrorComponent(appId) };
  });

  appViewCache.set(appId, LazyComponent);
  return LazyComponent;
}

export function lazyLoadDashboardWidget(
  appId: string
): LazyExoticComponent<ComponentType<DashboardWidgetProps>> | null {
  if (!activeAppIds.has(appId)) {
    return null;
  }

  const cached = widgetCache.get(appId);
  if (cached) {
    return cached;
  }

  const metadata = metadataRegistry.get(appId);
  if (!metadata) {
    return null;
  }

  const LazyComponent = lazy(async () => {
    const component = await loadDashboardWidgetComponent(appId);
    return { default: component ?? createWidgetErrorComponent() };
  });

  widgetCache.set(appId, LazyComponent);
  return LazyComponent;
}

export function clearLazyCache(appId?: string): void {
  if (appId) {
    appViewCache.delete(appId);
    widgetCache.delete(appId);
    loadedAppViews.delete(appId);
    loadedWidgets.delete(appId);
    appViewLoadPromises.delete(appId);
    widgetLoadPromises.delete(appId);
    return;
  }

  appViewCache.clear();
  widgetCache.clear();
  loadedAppViews.clear();
  loadedWidgets.clear();
  appViewLoadPromises.clear();
  widgetLoadPromises.clear();
}
