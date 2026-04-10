/**
 * Storage keys - centralized to prevent typos and ensure consistency
 */

export const STORAGE_KEYS = {
  // Auth
  ACCESS_TOKEN: "access_token",
  REFRESH_COOKIE: "refresh_token",

  // User preferences
  USER_SETTINGS: "shin_settings",
  USER_TIMEZONE: "user_timezone",

  // App state
  RECENT_COMMANDS: "shin_recent_commands",
  ONBOARDING_STATE: "shin_onboarding",
  WORKSPACE_SNAPSHOT: "shin_workspace_snapshot",
  STORE_CATALOG_SNAPSHOT: "shin_store_catalog_snapshot",
} as const;
