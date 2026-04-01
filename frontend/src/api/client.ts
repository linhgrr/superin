/**
 * API Client — re-exports from axios.ts for backward compatibility.
 *
 * New code should import directly from `@/api/axios`.
 * This file is kept for existing imports to continue working.
 */

export {
  api,
  axiosInstance,
  setAccessToken,
  clearAccessToken,
  getAccessToken,
  isAuthenticated,
  appPath,
  ApiError,
} from "./axios";

// Re-export for compatibility with old code
export { REFRESH_COOKIE_NAME, API_BASE_URL, API_TIMEOUT_MS } from "@/config";
