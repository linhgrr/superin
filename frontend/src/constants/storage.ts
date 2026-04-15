/**
 * Storage keys - centralized to prevent typos and ensure consistency
 */

export const STORAGE_KEYS = {
  // Auth
  ACCESS_TOKEN: "access_token",
  REFRESH_COOKIE: "refresh_token",

  // User preferences
  USER_SETTINGS: "superin_settings",
  USER_TIMEZONE: "user_timezone",

  // App state
  RECENT_COMMANDS: "superin_recent_commands",
  ONBOARDING_STATE: "superin_onboarding",
  WORKSPACE_SNAPSHOT: "superin_workspace_snapshot",
  STORE_CATALOG_SNAPSHOT: "superin_store_catalog_snapshot",

  // Chat
  CHAT_ACTIVE_THREAD_ID: "superin_chat_thread_id",
} as const;
