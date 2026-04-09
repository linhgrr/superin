/**
 * Axios instance with centralized auth interceptors.
 *
 * Features:
 * - Automatic access token injection
 * - Proactive token refresh (before expiry, not just on 401)
 * - 401 handling with token refresh queue (prevents race conditions)
 * - Failed refresh → auto logout redirect
 * - Request deduplication during refresh
 */

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { jwtDecode } from "jwt-decode";
import { API_BASE_URL, API_TIMEOUT_MS, ACCESS_TOKEN_REFRESH_AHEAD_SECONDS } from "@/config";
import { STORAGE_KEYS, AUTH_ROUTES, ROUTES } from "@/constants";

// ─── Constants ────────────────────────────────────────────────────────────────

// Token expiry from backend (15 minutes)
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;

// Cache proactive check for 30 seconds to avoid repeated checks
const PROACTIVE_CHECK_CACHE_MS = 30_000;

// ─── Token Storage ────────────────────────────────────────────────────────────

let accessToken: string | null = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
let lastProactiveCheck = 0;
let cachedRefreshNeeded = false;

export function setAccessToken(token: string): void {
  accessToken = token;
  lastProactiveCheck = 0;
  cachedRefreshNeeded = false;
  // localStorage for PWA persistence — survives tab close and browser restart
  try {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  } catch (e: unknown) {
    // Non-critical: in-memory token is still valid, localStorage failure (quota,
    // private browsing) won't break the current session — only page refresh.
    console.warn("[auth] Failed to persist access token to localStorage.", e);
  }
}

export function clearAccessToken(): void {
  accessToken = null;
  lastProactiveCheck = 0;
  cachedRefreshNeeded = false;
  try {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch (e: unknown) {
    console.warn("[auth] Failed to remove access token from localStorage.", e);
  }
}

export function getAccessToken(): string | null {
  return accessToken ?? localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

/**
 * Trigger logout and redirect to login page.
 * Exported for use in auth hooks and components.
 */
export function triggerLogout(): void {
  clearAccessToken();
  window.location.href = ROUTES.LOGIN;
}

/**
 * Check if token needs proactive refresh (approaching expiry).
 * Results are cached for 30 seconds to avoid repeated checks.
 */
function shouldRefreshProactively(): boolean {
  const now = Date.now();

  // Return cached result if checked recently
  if (now - lastProactiveCheck < PROACTIVE_CHECK_CACHE_MS) {
    return cachedRefreshNeeded;
  }

  const token = getAccessToken();
  if (!token) {
    lastProactiveCheck = now;
    cachedRefreshNeeded = false;
    return false;
  }

  try {
    const decoded = jwtDecode<{ exp?: number; iat?: number }>(token);
    const expiryTime = decoded.exp ? decoded.exp * 1000 : null;
    const issuedAt = decoded.iat ? decoded.iat * 1000 : null;

    let needsRefresh = false;

    if (expiryTime) {
      // Check if expiring soon
      needsRefresh = expiryTime - now < ACCESS_TOKEN_REFRESH_AHEAD_SECONDS * 1000;
    } else if (issuedAt) {
      // Fallback: use iat + 15 minutes
      needsRefresh = now - issuedAt > (ACCESS_TOKEN_EXPIRY_MS - ACCESS_TOKEN_REFRESH_AHEAD_SECONDS * 1000);
    }

    lastProactiveCheck = now;
    cachedRefreshNeeded = needsRefresh;
    return needsRefresh;
  } catch (error: unknown) {
    console.error("Failed to decode access token for proactive refresh check", error);
    lastProactiveCheck = now;
    cachedRefreshNeeded = false;
    return false;
  }
}

// ─── Axios Instance ───────────────────────────────────────────────────────────

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Send refresh_token cookie
});

// ─── Refresh Token Queue (Prevents Race Conditions) ──────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function isAuthRoute(url: string): boolean {
  return (
    url.includes(AUTH_ROUTES.LOGIN) ||
    url.includes(AUTH_ROUTES.REGISTER) ||
    url.includes(AUTH_ROUTES.LOGOUT) ||
    url.includes(AUTH_ROUTES.REFRESH)
  );
}

function subscribeToRefresh(callback: (token: string) => void): void {
  refreshSubscribers.push(callback);
}

function notifyRefreshSubscribers(token: string): void {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

function clearRefreshSubscribers(): void {
  refreshSubscribers = [];
}

async function performRefresh(): Promise<string | null> {
  try {
    const response = await axios.post<{ access_token: string }>(
      `${API_BASE_URL}/api${AUTH_ROUTES.REFRESH}`,
      {},
      {
        withCredentials: true,
        timeout: API_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    const newToken = response.data.access_token;
    setAccessToken(newToken);
    return newToken;
  } catch (error: unknown) {
    console.error("Failed to refresh access token", error);
    return null;
  }
}

// ─── Request Interceptor: Proactive Refresh + Token Injection ─────────────────

interface AuthConfig extends InternalAxiosRequestConfig {
  _skipProactiveRefresh?: boolean;
  _retry?: boolean;
}

axiosInstance.interceptors.request.use(
  async (config: AuthConfig) => {
    // Skip auth for auth endpoints
    const url = config.url ?? "";
    if (isAuthRoute(url)) {
      return config;
    }

    // Check if proactive refresh is disabled for this request
    const skipProactive = config._skipProactiveRefresh;
    config._skipProactiveRefresh = undefined; // Clean up

    // Check if we need proactive refresh (token expiring soon)
    if (!skipProactive && !isRefreshing && shouldRefreshProactively()) {
      isRefreshing = true;
      try {
        const newToken = await performRefresh();
        if (!newToken) {
          triggerLogout();
          throw new Error("Session expired");
        }
        notifyRefreshSubscribers(newToken);
      } finally {
        isRefreshing = false;
      }
    }

    // If refresh is in progress, queue this request
    if (isRefreshing) {
      return new Promise((resolve) => {
        subscribeToRefresh((token) => {
          config.headers.set("Authorization", `Bearer ${token}`);
          resolve(config);
        });
      });
    }

    // Inject current token
    const token = getAccessToken();
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: Handle 401 + Refresh ───────────────────────────────

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AuthConfig;

    // Only handle 401 errors from non-refresh endpoints
    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      isAuthRoute(originalRequest.url ?? "")
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // If refresh is in progress, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeToRefresh((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.set("Authorization", `Bearer ${token}`);
          }
          axiosInstance(originalRequest)
            .then((response) => resolve(response))
            .catch((err) => reject(err));
        });
      });
    }

    // Start refresh
    isRefreshing = true;

    try {
      const newToken = await performRefresh();

      if (!newToken) {
        // Refresh failed → logout and redirect
        clearRefreshSubscribers();
        triggerLogout();
        return Promise.reject(error);
      }

      // Notify queued requests and retry original
      notifyRefreshSubscribers(newToken);

      if (originalRequest.headers) {
        originalRequest.headers.set("Authorization", `Bearer ${newToken}`);
      }
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      clearRefreshSubscribers();
      triggerLogout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// ─── Error Handling ─────────────────────────────────────────────────────────

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

function handleApiError(error: AxiosError): never {
  const status = error.response?.status || 0;
  const body = error.response?.data;
  const message =
    body && typeof body === "object"
      ? "detail" in body
        ? String((body as { detail: unknown }).detail)
        : "error" in body
          ? String((body as { error: unknown }).error)
          : error.message || "Network error"
      : error.message || "Network error";

  throw new ApiError(message, status, body);
}

// ─── API Methods ─────────────────────────────────────────────────────────────

export const api = {
  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await axiosInstance.get<T>(path, config);
      return response.data;
    } catch (error) {
      handleApiError(error as AxiosError);
    }
  },

  async post<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await axiosInstance.post<T>(path, body, config);
      return response.data;
    } catch (error) {
      handleApiError(error as AxiosError);
    }
  },

  async put<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await axiosInstance.put<T>(path, body, config);
      return response.data;
    } catch (error) {
      handleApiError(error as AxiosError);
    }
  },

  async patch<T>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await axiosInstance.patch<T>(path, body, config);
      return response.data;
    } catch (error) {
      handleApiError(error as AxiosError);
    }
  },

  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await axiosInstance.delete<T>(path, config);
      return response.data;
    } catch (error) {
      handleApiError(error as AxiosError);
    }
  },

  // Raw axios instance for advanced use cases
  get raw() {
    return axiosInstance;
  },
};

// ─── Path Builder ─────────────────────────────────────────────────────────────

export function appPath(appId: string, path = "" ): string {
  return `/api/apps/${appId}${path}`;
}
