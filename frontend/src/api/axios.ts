import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL, API_TIMEOUT_MS, ACCESS_TOKEN_REFRESH_AHEAD_SECONDS } from "@/config";
import {
  clearRefreshSubscribers,
  getAccessToken,
  isAuthenticated,
  isAuthRoute,
  isRefreshInFlight,
  notifyRefreshSubscribers,
  performRefresh,
  setAccessToken,
  setRefreshInFlight,
  shouldRefreshProactively,
  subscribeToRefresh,
  triggerLogout,
} from "./auth-session";

// ─── Axios Instance ───────────────────────────────────────────────────────────

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Send refresh_token cookie
});

// ─── Request Interceptor: Proactive Refresh + Token Injection ─────────────────

interface AuthConfig extends InternalAxiosRequestConfig {
  _skipProactiveRefresh?: boolean;
  _retry?: boolean;
}

axiosInstance.interceptors.request.use(
  async (config: AuthConfig) => {
    // Let browser generate multipart boundaries for FormData payloads.
    // If JSON content-type leaks into these requests, File objects can be
    // serialized incorrectly (e.g. `{ file: {} }`).
    if (config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }

    // Skip auth for auth endpoints
    const url = config.url ?? "";
    if (isAuthRoute(url)) {
      return config;
    }

    // Check if proactive refresh is disabled for this request
    const skipProactive = config._skipProactiveRefresh;
    config._skipProactiveRefresh = undefined; // Clean up

    // Check if we need proactive refresh (token expiring soon)
    if (!skipProactive && !isRefreshInFlight() && shouldRefreshProactively()) {
      setRefreshInFlight(true);
      try {
        const newToken = await performRefresh();
        if (!newToken) {
          triggerLogout();
          throw new Error("Session expired");
        }
        notifyRefreshSubscribers(newToken);
      } finally {
        setRefreshInFlight(false);
      }
    }

    // If refresh is in progress, queue this request
    if (isRefreshInFlight()) {
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
    if (isRefreshInFlight()) {
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
    setRefreshInFlight(true);

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
      setRefreshInFlight(false);
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
