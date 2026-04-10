/**
 * Shared timezone utilities — pure functions, no React dependency.
 *
 * These are frontend-only utilities. Backend datetime handling uses
 * UTC ISO strings throughout; this module handles display-side conversion
 * to the user's local timezone.
 *
 * Usage:
 *   import { formatDateTime, getUserTimezone, getTodayRange } from '@/shared/utils/timezone';
 *
 * Design rule: Only pure utilities with NO app-specific business logic
 * may live here. Anything that imports from @/apps/ must live in those apps.
 */

import { STORAGE_KEYS } from '@/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

export const COMMON_TIMEZONES = {
  UTC: 'UTC',
  ASIA_HO_CHI_MINH: 'Asia/Ho_Chi_Minh',
  ASIA_BANGKOK: 'Asia/Bangkok',
  ASIA_SINGAPORE: 'Asia/Singapore',
  ASIA_TOKYO: 'Asia/Tokyo',
  ASIA_SEOUL: 'Asia/Seoul',
  ASIA_SHANGHAI: 'Asia/Shanghai',
  ASIA_HONG_KONG: 'Asia/Hong_Kong',
  ASIA_KOLKATA: 'Asia/Kolkata',
  ASIA_DUBAI: 'Asia/Dubai',
  EUROPE_LONDON: 'Europe/London',
  EUROPE_PARIS: 'Europe/Paris',
  EUROPE_BERLIN: 'Europe/Berlin',
  AMERICA_NEW_YORK: 'America/New_York',
  AMERICA_LOS_ANGELES: 'America/Los_Angeles',
  AMERICA_CHICAGO: 'America/Chicago',
  AMERICA_TORONTO: 'America/Toronto',
  AMERICA_SAO_PAULO: 'America/Sao_Paulo',
  AUSTRALIA_SYDNEY: 'Australia/Sydney',
  AUSTRALIA_MELBOURNE: 'Australia/Melbourne',
} as const;

export const DEFAULT_TIMEZONE = 'UTC';

// ─── Re-export date-level helpers ─────────────────────────────────────────────

export {
  isToday,
  isPast,
  getTodayRange,
} from './timezone-dates';

export type { DateInput } from './timezone-dates';

// ─── Re-export formatters ────────────────────────────────────────────────────

export {
  formatDateTime,
  formatDate,
  formatTime,
  getLocalDateTimeStrings,
} from './timezone-formatters';

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Convert UTC ISO string to Date object.
 * Returns null if input is null/undefined or invalid.
 */
export function utcToLocalDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch (error: unknown) {
    console.error('[timezone] Failed to convert UTC string to local date', error);
    return null;
  }
}

// ─── User Timezone ───────────────────────────────────────────────────────────

/**
 * Get user's timezone from storage or browser default.
 *
 * Priority:
 * 1. User's explicit setting from localStorage
 * 2. Browser's timezone
 * 3. UTC fallback
 */
export function getUserTimezone(): string {
  const stored = localStorage.getItem(STORAGE_KEYS.USER_TIMEZONE);
  if (stored) return stored;

  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz) return browserTz;
  } catch (error: unknown) {
    console.error('[timezone] Failed to resolve browser timezone', error);
  }

  return DEFAULT_TIMEZONE;
}

/**
 * Set user's timezone preference.
 */
export function setUserTimezone(timezone: string): void {
  localStorage.setItem(STORAGE_KEYS.USER_TIMEZONE, timezone);
}

/**
 * Clear stored timezone (e.g., on logout).
 */
export function clearUserTimezone(): void {
  localStorage.removeItem(STORAGE_KEYS.USER_TIMEZONE);
}
