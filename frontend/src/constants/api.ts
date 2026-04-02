/**
 * API Routes - Core platform only.
 *
 * Plug-n-play rule: Core constants must NOT know about specific apps.
 * App-specific paths are defined in each app's own api.ts file.
 *
 * Example:
 *   // apps/finance/api.ts
 *   const BASE = "/api/apps/finance";
 *   export const financeApi = {
 *     wallets: `${BASE}/wallets`,
 *     transactions: (id: string) => `${BASE}/transactions/${id}`,
 *   };
 */

// ─── Core Routes ──────────────────────────────────────────────────────────────

// Auth routes
export const AUTH_ROUTES = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
  SETTINGS: "/auth/me/settings",
} as const;

// Catalog routes
export const CATALOG_ROUTES = {
  APPS: "/catalog",           // GET /api/catalog — list all apps
  CATEGORIES: "/catalog/categories",
  INSTALL: "/catalog/install",
  UNINSTALL: "/catalog/uninstall",
  PREFERENCES: (appId: string) => `/catalog/preferences/${appId}`,
} as const;

// Chat routes
export const CHAT_ROUTES = {
  STREAM: "/chat/stream",
} as const;

// ─── Full API Paths ───────────────────────────────────────────────────────────

export const API_PATHS = {
  // Auth
  LOGIN: `/api${AUTH_ROUTES.LOGIN}`,
  REGISTER: `/api${AUTH_ROUTES.REGISTER}`,
  REFRESH: `/api${AUTH_ROUTES.REFRESH}`,
  LOGOUT: `/api${AUTH_ROUTES.LOGOUT}`,
  ME: `/api${AUTH_ROUTES.ME}`,
  SETTINGS: `/api${AUTH_ROUTES.SETTINGS}`,

  // Catalog
  CATALOG_APPS: `/api${CATALOG_ROUTES.APPS}`,
  CATALOG_CATEGORIES: `/api${CATALOG_ROUTES.CATEGORIES}`,
  CATALOG_INSTALL: (appId: string) => `/api${CATALOG_ROUTES.INSTALL}/${appId}`,
  CATALOG_UNINSTALL: (appId: string) => `/api${CATALOG_ROUTES.UNINSTALL}/${appId}`,
  CATALOG_ALL_PREFERENCES: `/api/catalog/preferences`,
  CATALOG_PREFERENCES: (appId: string) => `/api${CATALOG_ROUTES.PREFERENCES(appId)}`,

  // Chat
  CHAT_STREAM: `/api${CHAT_ROUTES.STREAM}`,
} as const;

// ─── App API Helper ─────────────────────────────────────────────────────────────
/**
 * Build base path for an app API. Apps should use this or define their own BASE.
 *
 * Usage in app api.ts:
 *   const BASE = appApiBase("finance"); // → "/api/apps/finance"
 */
export const appApiBase = (appId: string): string => `/api/apps/${appId}`;
