import axios from "axios";
import { jwtDecode } from "jwt-decode";

import { API_BASE_URL, API_TIMEOUT_MS, ACCESS_TOKEN_REFRESH_AHEAD_SECONDS } from "@/config";
import { AUTH_ROUTES } from "@/constants/api";
import { ROUTES } from "@/constants/routes";
import { STORAGE_KEYS } from "@/constants/storage";

const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const PROACTIVE_CHECK_CACHE_MS = 30_000;

let accessToken: string | null = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
let lastProactiveCheck = 0;
let cachedRefreshNeeded = false;
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

export function setAccessToken(token: string): void {
  accessToken = token;
  lastProactiveCheck = 0;
  cachedRefreshNeeded = false;

  try {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  } catch (error: unknown) {
    console.warn("[auth] Failed to persist access token to localStorage.", error);
  }
}

export function clearAccessToken(): void {
  accessToken = null;
  lastProactiveCheck = 0;
  cachedRefreshNeeded = false;

  try {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  } catch (error: unknown) {
    console.warn("[auth] Failed to remove access token from localStorage.", error);
  }
}

export function getAccessToken(): string | null {
  return accessToken ?? localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

export function triggerLogout(): void {
  clearAccessToken();
  window.location.href = ROUTES.LOGIN;
}

export function isAuthRoute(url: string): boolean {
  return (
    url.includes(AUTH_ROUTES.LOGIN) ||
    url.includes(AUTH_ROUTES.REGISTER) ||
    url.includes(AUTH_ROUTES.LOGOUT) ||
    url.includes(AUTH_ROUTES.REFRESH)
  );
}

export function isRefreshInFlight(): boolean {
  return isRefreshing;
}

export function setRefreshInFlight(value: boolean): void {
  isRefreshing = value;
}

export function subscribeToRefresh(callback: (token: string) => void): void {
  refreshSubscribers.push(callback);
}

export function notifyRefreshSubscribers(token: string): void {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

export function clearRefreshSubscribers(): void {
  refreshSubscribers = [];
}

export async function performRefresh(): Promise<string | null> {
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
      },
    );
    const newToken = response.data.access_token;
    setAccessToken(newToken);
    return newToken;
  } catch (error: unknown) {
    console.error("Failed to refresh access token", error);
    return null;
  }
}

export function shouldRefreshProactively(): boolean {
  const now = Date.now();

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
      needsRefresh = expiryTime - now < ACCESS_TOKEN_REFRESH_AHEAD_SECONDS * 1000;
    } else if (issuedAt) {
      needsRefresh =
        now - issuedAt > ACCESS_TOKEN_EXPIRY_MS - ACCESS_TOKEN_REFRESH_AHEAD_SECONDS * 1000;
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
