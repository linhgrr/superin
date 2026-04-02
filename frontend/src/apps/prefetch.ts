/**
 * Prefetch utilities for lazy loaded apps and widgets
 *
 * Prefetch app chunks on hover/focus for instant navigation
 * Follows vercel-react-best-practices: bundle-preload
 */

import { getAppMetadata, markAppViewLoaded, markWidgetLoaded } from "./lazy-registry";

// Track which apps have been prefetched
const prefetchedApps = new Set<string>();
const prefetchedWidgets = new Set<string>();

/**
 * Prefetch an app's chunk in the background.
 * Safe to call multiple times - only prefetches once per app.
 */
export function prefetchApp(appId: string): void {
  if (prefetchedApps.has(appId)) {
    return;
  }

  const metadata = getAppMetadata(appId);
  if (!metadata) {
    return;
  }

  // Mark as prefetched immediately to prevent duplicate requests
  prefetchedApps.add(appId);

  // Use requestIdleCallback for non-critical prefetching
  const schedulePrefetch =
    typeof window !== "undefined" && "requestIdleCallback" in window
      ? window.requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 1);

  schedulePrefetch(() => {
    // Trigger the dynamic import to load the chunk
    metadata
      .loadAppView()
      .then((result) => {
        // Đánh dấu component đã load để có thể render trực tiếp
        markAppViewLoaded(appId, result.default);
      })
      .catch(() => {
        // Reset on error so we can retry later
        prefetchedApps.delete(appId);
      });
  });
}

/**
 * Prefetch widget component for an app.
 * Widgets share the same chunk with AppView nên thường đã được load cùng.
 */
export function prefetchWidget(appId: string): void {
  if (prefetchedWidgets.has(appId)) {
    return;
  }

  const metadata = getAppMetadata(appId);
  if (!metadata) {
    return;
  }

  prefetchedWidgets.add(appId);

  const schedulePrefetch =
    typeof window !== "undefined" && "requestIdleCallback" in window
      ? window.requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 1);

  schedulePrefetch(() => {
    metadata
      .loadDashboardWidget()
      .then((result) => {
        // Đánh dấu widget đã load
        markWidgetLoaded(appId, result.default);
      })
      .catch(() => {
        prefetchedWidgets.delete(appId);
      });
  });
}

/**
 * Prefetch cả AppView và Widget cho một app.
 */
export function prefetchAppAndWidget(appId: string): void {
  prefetchApp(appId);
  prefetchWidget(appId);
}

/**
 * Create hover handlers for prefetching on mouse enter.
 * Usage: <Link {...prefetchHandlers(appId)} to={`/apps/${appId}`}>
 */
export function prefetchHandlers(appId: string) {
  return {
    onMouseEnter: () => prefetchApp(appId),
    onFocus: () => prefetchApp(appId),
  };
}

/**
 * Prefetch multiple apps at once (e.g., installed apps on dashboard).
 * Bao gồm cả widgets.
 */
export function prefetchApps(appIds: string[]): void {
  // Stagger prefetches to avoid network congestion
  appIds.forEach((appId, index) => {
    setTimeout(() => {
      prefetchAppAndWidget(appId);
    }, index * 100);
  });
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
