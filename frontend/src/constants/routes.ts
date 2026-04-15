/**
 * UI Routes - frontend navigation paths
 */

export const ROUTES = {
  // Public
  LOGIN: "/login",

  // Protected
  DASHBOARD: "/dashboard",
  STORE: "/store",
  BILLING: "/billing",
  BILLING_SUCCESS: "/billing/success",
  BILLING_CANCEL: "/billing/cancel",
  SETTINGS: "/settings",
  SETTINGS_TAB: (tab?: string) =>
    tab ? `/settings?tab=${encodeURIComponent(tab)}` : "/settings",
  ADMIN: "/admin",
  CHAT: "/chat",
  APP_DETAIL: (appId: string) => `/apps/${appId}`,

  // Default
  ROOT: "/",
} as const;

// Route display names for breadcrumbs, analytics, etc.
export const ROUTE_NAMES: Record<string, string> = {
  [ROUTES.LOGIN]: "Login",
  [ROUTES.DASHBOARD]: "Dashboard",
  [ROUTES.STORE]: "App Store",
  [ROUTES.BILLING]: "Billing",
  [ROUTES.SETTINGS]: "Settings",
  [ROUTES.ADMIN]: "Admin",
  [ROUTES.CHAT]: "Chat",
};
