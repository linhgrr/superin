/**
 * Prefetch utilities for lazy loaded apps and widgets
 *
 * Prefetch app chunks on hover/focus for instant navigation
 * Follows vercel-react-best-practices: bundle-preload
 */

import { loadAppViewComponent, loadDashboardWidgetComponent } from "./lazy-registry";

// Track which apps have been prefetched
const prefetchedApps = new Set<string>();
const prefetchedWidgets = new Set<string>();

function scheduleIdle(callback: () => void): void {
  const runner =
    typeof window !== "undefined" && "requestIdleCallback" in window
      ? window.requestIdleCallback.bind(window)
      : (cb: IdleRequestCallback) => window.setTimeout(cb, 1);

  runner(() => callback());
}

function loadApp(appId: string, eager: boolean): void {
  if (prefetchedApps.has(appId)) {
    return;
  }

  prefetchedApps.add(appId);

  const run = async () => {
    const component = await loadAppViewComponent(appId);
    if (!component) {
      prefetchedApps.delete(appId);
    }
  };

  if (eager) {
    void Promise.resolve().then(run);
    return;
  }

  scheduleIdle(run);
}

function loadWidget(appId: string, eager: boolean): void {
  if (prefetchedWidgets.has(appId)) {
    return;
  }

  prefetchedWidgets.add(appId);

  const run = async () => {
    const component = await loadDashboardWidgetComponent(appId);
    if (!component) {
      prefetchedWidgets.delete(appId);
    }
  };

  if (eager) {
    void Promise.resolve().then(run);
    return;
  }

  scheduleIdle(run);
}

/**
 * Prefetch an app's chunk in the background.
 * Safe to call multiple times - only prefetches once per app.
 */
export function prefetchApp(appId: string): void {
  loadApp(appId, false);
}

/**
 * Prefetch widget component for an app.
 * Widgets usually share the same app-local bundle as the screen module.
 */
export function prefetchWidget(appId: string): void {
  loadWidget(appId, false);
}

export function primeApp(appId: string): void {
  loadApp(appId, true);
}

export function primeWidget(appId: string): void {
  loadWidget(appId, true);
}

/** Prefetch both the app screen and widget bundle for one app. */
export function prefetchAppAndWidget(appId: string): void {
  prefetchApp(appId);
  prefetchWidget(appId);
}

export function primeAppAndWidget(appId: string): void {
  primeApp(appId);
  primeWidget(appId);
}

/**
 * Create hover handlers for prefetching on mouse enter.
 * Usage: <Link {...prefetchHandlers(appId)} to={`/apps/${appId}`}>
 */
export function prefetchHandlers(appId: string) {
  return {
    onMouseEnter: () => prefetchApp(appId),
    onFocus: () => prefetchApp(appId),
    onPointerDown: () => primeAppAndWidget(appId),
    onTouchStart: () => primeAppAndWidget(appId),
  };
}

/** Prefetch multiple apps at once, including their widgets. */
export function prefetchApps(appIds: string[]): () => void {
  const handles = appIds.map((appId, index) =>
    window.setTimeout(() => {
      prefetchAppAndWidget(appId);
    }, index * 100)
  );

  return () => {
    handles.forEach((handle) => window.clearTimeout(handle));
  };
}

/**
 * Check if an app has been prefetched
 */
export function isAppPrefetched(appId: string): boolean {
  return prefetchedApps.has(appId);
}

/**
 * Clear prefetch cache (useful for testing/HMR)
 */
export function clearPrefetchCache(): void {
  prefetchedApps.clear();
  prefetchedWidgets.clear();
}
