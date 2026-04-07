/** Frontend-wide constants — single source of truth. */

const HARDCODED_API_BASE_URL = "https://linhdzqua148-superin-be.hf.space";

// ─── Auth / Tokens ──────────────────────────────────────────────────────────

export const REFRESH_COOKIE_NAME = "refresh_token";

/** How many seconds before access token expiry to refresh proactively. */
export const ACCESS_TOKEN_REFRESH_AHEAD_SECONDS = 60; // 1 minute

// ─── API ────────────────────────────────────────────────────────────────────

export const API_BASE_URL = HARDCODED_API_BASE_URL;

/** Time in ms before an API request times out. */
export const API_TIMEOUT_MS = 15_000; // 15 seconds

// ─── Widget ─────────────────────────────────────────────────────────────────

export const WIDGET_SIZE_COLUMNS: Record<string, number> = {
  compact: 4,
  standard: 6,
  wide: 8,
  tall: 6,
  full: 12,
};

// ─── App ────────────────────────────────────────────────────────────────────

export const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Shin SuperApp";
export const APP_VERSION = "2.1.0";
