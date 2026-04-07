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

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Convert UTC ISO string to Date object.
 * Returns null if input is null/undefined or invalid.
 */
export function utcToLocalDate(utcString: string | null | undefined): Date | null {
  if (!utcString) return null;

  try {
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch (error: unknown) {
    console.error('[timezone] Failed to convert UTC string to local date', error);
    return null;
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format a UTC datetime string for display in user's local timezone.
 */
export function formatDateTime(
  utcString: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  const date = utcToLocalDate(utcString);
  if (!date) return '';

  const tz = getUserTimezone();
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: tz }).format(date);
}

/**
 * Format only the date portion (no time).
 */
export function formatDate(
  utcString: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const date = utcToLocalDate(utcString);
  if (!date) return '';

  const tz = getUserTimezone();
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: tz }).format(date);
}

/**
 * Format only the time portion (no date).
 */
export function formatTime(
  utcString: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  const date = utcToLocalDate(utcString);
  if (!date) return '';

  const tz = getUserTimezone();
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: tz }).format(date);
}

// ─── Date Checks ──────────────────────────────────────────────────────────────

/**
 * Check if a UTC datetime string is "today" in user's local timezone.
 */
export function isToday(utcString: string | null | undefined): boolean {
  const date = utcToLocalDate(utcString);
  if (!date) return false;

  const tz = getUserTimezone();
  const now = new Date();

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return dateStr === todayStr;
}

/**
 * Check if a UTC datetime string is in the past.
 */
export function isPast(utcString: string | null | undefined): boolean {
  const date = utcToLocalDate(utcString);
  if (!date) return false;
  return date.getTime() < Date.now();
}

// ─── Range Helpers ────────────────────────────────────────────────────────────

/**
 * Get start and end of "today" in user's timezone, returned as UTC ISO strings.
 */
export function getTodayRange(): { start: string; end: string } {
  const tz = getUserTimezone();
  const now = new Date();

  const startFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = startFormatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  if (!year || !month || !day) {
    // Fallback to UTC
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  const startLocal = new Date(`${year}-${month}-${day}T00:00:00`);
  const endLocal = new Date(`${year}-${month}-${day}T23:59:59.999`);

  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
  };
}

/**
 * Get current date and time strings in user's local timezone.
 */
export function getLocalDateTimeStrings(): [string, string] {
  const tz = getUserTimezone();
  const now = new Date();

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const timeStr = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  return [dateStr, timeStr];
}