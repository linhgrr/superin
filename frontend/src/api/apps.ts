/**
 * App API — generic plugin route caller.
 * All app routes are mounted under /api/apps/{appId}/...
 *
 * Plug-n-play: This file contains NO app-specific knowledge.
 * Each app defines its own typed API functions in src/apps/{appId}/api.ts.
 */
import { apiFetch } from "./client";

/**
 * Make a typed request to an app-specific route.
 * The caller specifies the appId + path, method, and body.
 */
export async function appRequest<T = unknown>(
  appId: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return apiFetch<T>(`/api/apps/${appId}${path}`, init);
}
