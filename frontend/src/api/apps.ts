/**
 * App API — generic plugin route caller.
 * All app routes are mounted under /api/apps/{appId}/...
 *
 * Plug-n-play: This file contains NO app-specific knowledge.
 * Each app defines its own typed API functions in src/apps/{appId}/api.ts.
 */
import type { AxiosRequestConfig, Method } from "axios";

import { api } from "./client";

type AppRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

/**
 * Make a typed request to an app-specific route.
 * The caller specifies the appId + path, method, and body.
 */
export async function appRequest<T = unknown>(
  appId: string,
  path: string,
  init: AppRequestInit = {}
): Promise<T> {
  const method = (init.method?.toUpperCase() ?? "GET") as Method;
  const headers = normalizeHeaders(init.headers);

  const response = await api.raw.request({
    url: `/api/apps/${appId}${path}`,
    method,
    data: init.body,
    headers,
    signal: init.signal as AbortSignal | undefined,
  });

  return response.data as T;
}

function normalizeHeaders(headers: RequestInit["headers"]): AxiosRequestConfig["headers"] {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}
