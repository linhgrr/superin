/**
 * Axios instance with centralized auth interceptors.
 *
 * Features:
 * - Automatic access token injection
 * - 401 handling with token refresh queue (prevents race conditions)
 * - Failed refresh → auto logout redirect
 * - Request deduplication during refresh
 */

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL, API_TIMEOUT_MS } from "@/config";

// ─── Token Storage ────────────────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = "access_token";

let accessToken: string | null = sessionStorage.getItem(ACCESS_TOKEN_KEY);

export function setAccessToken(token: string): void {
  accessToken = token;
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  accessToken = null;
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
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

// ─── Request Interceptor: Inject Access Token ─────────────────────────────────

axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Refresh Token Queue (Prevents Race Conditions) ──────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeToRefresh(callback: (token: string) => void): void {
  refreshSubscribers.push(callback);
}

function notifyRefreshSubscribers(token: string): void {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

async function performRefresh(): Promise<string | null> {
  try {
    const response = await axios.post<{ access_token: string }>(
      `${API_BASE_URL}/api/auth/refresh`,
      {},
      { withCredentials: true }
    );
    const newToken = response.data.access_token;
    setAccessToken(newToken);
    return newToken;
  } catch {
    return null;
  }
}

// ─── Response Interceptor: Handle 401 + Refresh ───────────────────────────────

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Only handle 401 errors from non-refresh endpoints
    if (
      error.response?.status !== 401 ||
      originalRequest._retry ||
      originalRequest.url === "/api/auth/refresh"
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // If refresh is in progress, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeToRefresh((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
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
        // Refresh failed → logout
        clearAccessToken();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      // Notify queued requests and retry original
      notifyRefreshSubscribers(newToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
      }
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      clearAccessToken();
      window.location.href = "/login";
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
    body && typeof body === "object" && "detail" in body
      ? String((body as { detail: unknown }).detail)
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

  // Raw axios instance for streaming (SSE)
  get raw() {
    return axiosInstance;
  },
};

// ─── Path Builder ─────────────────────────────────────────────────────────────

export function appPath(appId: string, path = "" ): string {
  return `/api/apps/${appId}${path}`;
}
