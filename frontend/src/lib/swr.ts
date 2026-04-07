/**
 * Shared SWR Configuration
 *
 * Plug-n-play: This file has NO app-specific imports.
 * Each app creates its own hooks using this base config.
 */

import useSWR, { SWRConfiguration, mutate as swrMutate } from "swr";
import { api } from "@/api/client";

// ─── Global SWR Config ───────────────────────────────────────────────────────

export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 2000,
  errorRetryCount: 3,
  errorRetryInterval: 3000,
  keepPreviousData: true,
  suspense: false,
};

// ─── Base Fetcher ───────────────────────────────────────────────────────────

export const fetcher = <T,>(path: string): Promise<T> => api.get<T>(path);

// ─── Utility Hook Factory ───────────────────────────────────────────────────

/**
 * Create a typed SWR hook for a specific endpoint.
 * Apps use this to create their own typed hooks.
 */
export function createSwrHook<T>(
  key: string,
  fetcherFn: () => Promise<T>,
  config?: Partial<SWRConfiguration>
) {
  return function useSwrData() {
    return useSWR<T>(key, fetcherFn, { ...swrConfig, ...config });
  };
}

// ─── Mutation Helpers ───────────────────────────────────────────────────────

export { swrMutate as mutate };

/**
 * Match keys by prefix for bulk invalidation
 */
export function mutateByPrefix(prefix: string) {
  return swrMutate((key) => {
    if (typeof key === "string") {
      return key.startsWith(prefix);
    }
    if (Array.isArray(key) && typeof key[0] === "string") {
      return key[0].startsWith(prefix);
    }
    return false;
  });
}
