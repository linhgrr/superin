/**
 * Base API client — thin fetch wrapper with auth + error handling.
 *
 * Handles:
 * - Access token injection (Bearer)
 * - Automatic 401 → refresh → retry
 * - Refresh token cookie forwarding
 * - Typed error responses
 */

import { REFRESH_COOKIE_NAME, API_BASE_URL, API_TIMEOUT_MS } from "@/config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Token storage (in-memory — survives page reloads via sessionStorage) ──

let _accessToken: string | null = sessionStorage.getItem("access_token");

export function setAccessToken(token: string) {
  _accessToken = token;
  sessionStorage.setItem("access_token", token);
}

export function clearAccessToken() {
  _accessToken = null;
  sessionStorage.removeItem("access_token");
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function isAuthenticated(): boolean {
  return _accessToken !== null;
}

// ─── Low-level fetch ────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };

  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
      credentials: "include", // forward refresh_token cookie
    });

    clearTimeout(timer);

    if (res.ok) {
      // 204 No Content
      if (res.status === 204) return undefined as unknown as T;
      return res.json() as Promise<T>;
    }

    // Attempt parse body for error detail
    let body: unknown;
    try { body = await res.json(); } catch { body = undefined; }

    throw new ApiError(
      (body && typeof body === "object" && "detail" in body)
        ? String((body as { detail: unknown }).detail)
        : `HTTP ${res.status}`,
      res.status,
      body
    );
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : "Network error",
      0
    );
  }
}

// ─── Auth-aware fetch with silent refresh retry ─────────────────────────────

async function authedRequest<T>(
  path: string,
  init: RequestInit = {},
  retrying = false
): Promise<T> {
  try {
    return await request<T>(path, init);
  } catch (err) {
    if (
      !retrying &&
      err instanceof ApiError &&
      err.status === 401 &&
      path !== "/api/auth/refresh"
    ) {
      // Try refresh
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry original request with fresh token
        return authedRequest<T>(path, init, true);
      }
      // Refresh failed → clear session
      clearAccessToken();
      window.location.href = "/login";
    }
    throw err;
  }
}

// ─── Token refresh ───────────────────────────────────────────────────────────

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await request<{ access_token: string }>(
      "/api/auth/refresh",
      { method: "POST", credentials: "include" }
    );
    setAccessToken(res.access_token);
    return true;
  } catch {
    return false;
  }
}

// ─── Convenience HTTP methods ───────────────────────────────────────────────

export const api = {
  get<T>(path: string) {
    return authedRequest<T>(path);
  },

  post<T>(path: string, body?: unknown) {
    return authedRequest<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(path: string, body?: unknown) {
    return authedRequest<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: unknown) {
    return authedRequest<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string) {
    return authedRequest<T>(path, { method: "DELETE" });
  },
};

// ─── App-specific API path builder ──────────────────────────────────────────

export function appPath(appId: string, path = "") {
  return `/api/apps/${appId}${path}`;
}

export { REFRESH_COOKIE_NAME };
