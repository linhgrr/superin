/**
 * UI Routes - frontend navigation paths
 */

export const ROUTES = {
  // Public
  LOGIN: "/login",

  // Protected
  DASHBOARD: "/dashboard",
  STORE: "/store",
  SETTINGS: "/settings",
  APP_DETAIL: (appId: string) => `/apps/${appId}`,

  // Default
  ROOT: "/",
} as const;

// Route display names for breadcrumbs, analytics, etc.
export const ROUTE_NAMES: Record<string, string> = {
  [ROUTES.LOGIN]: "Login",
  [ROUTES.DASHBOARD]: "Dashboard",
  [ROUTES.STORE]: "App Store",
  [ROUTES.SETTINGS]: "Settings",
};
