/**
 * usePrefetch hook - Prefetch app chunks on hover for instant navigation
 *
 * Usage:
 *   const prefetch = usePrefetch();
 *   <Link onMouseEnter={() => prefetch('finance')} to="/apps/finance">Finance</Link>
 *   // Or with shorthand:
 *   <Link {...usePrefetchHandlers('finance')} to="/apps/finance">Finance</Link>
 */

import { useCallback } from "react";
import { prefetchApp, prefetchHandlers } from "@/apps/prefetch";

/**
 * Hook trả về prefetch function.
 * Safe to call multiple times.
 */
export function usePrefetch(): (appId: string) => void {
  return useCallback((appId: string) => {
    prefetchApp(appId);
  }, []);
}

/**
 * Hook trả về event handlers cho Link/Button.
 * Prefetch on hover/focus.
 */
export function usePrefetchHandlers(appId: string) {
  return prefetchHandlers(appId);
}

/**
 * Hook kết hợp prefetch + navigation.
 * Prefetch on hover, then navigate on click.
 */
export function usePrefetchableLink(appId: string) {
  const handlers = usePrefetchHandlers(appId);

  return {
    ...handlers,
    // prefetch ngay lập tức khi mount nếu có khả năng user sẽ click
    prefetchNow: () => prefetchApp(appId),
  };
}
