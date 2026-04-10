import { useEffect, useRef } from "react";

interface RenderLoopDebugOptions {
  threshold?: number;
  windowMs?: number;
  details?: () => Record<string, unknown>;
}

const isDev = import.meta.env.DEV;

/**
 * Dev-only guard that logs a stack trace when a component renders
 * suspiciously many times within a short time window.
 */
export function useRenderLoopDebug(
  name: string,
  {
    threshold = 30,
    windowMs = 1000,
    details,
  }: RenderLoopDebugOptions = {}
): void {
  const countRef = useRef(0);
  const windowStartRef = useRef(0);

  if (!isDev) {
    return;
  }

  const now = performance.now();
  if (windowStartRef.current === 0 || now - windowStartRef.current > windowMs) {
    windowStartRef.current = now;
    countRef.current = 0;
  }

  countRef.current += 1;
  if (countRef.current === threshold) {
    console.groupCollapsed(
      `[debug][render-loop] ${name}: ${countRef.current} renders in ${Math.round(now - windowStartRef.current)}ms`
    );
    if (details) {
      console.log(details());
    }
    console.trace(`[debug][render-loop] ${name}`);
    console.groupEnd();
  }
}

/**
 * Dev-only helper to see if a specific effect dependency keeps changing.
 */
export function useEffectDependencyDebug(
  name: string,
  deps: Record<string, unknown>
): void {
  const prevRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!isDev) {
      return;
    }

    const prev = prevRef.current;
    if (prev) {
      const changed = Object.keys(deps).filter((key) => !Object.is(prev[key], deps[key]));
      if (changed.length > 0) {
        console.debug(`[debug][effect-deps] ${name} changed`, changed);
      }
    }
    prevRef.current = deps;
  });
}
