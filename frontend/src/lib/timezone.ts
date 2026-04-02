/**
 * Frontend timezone utilities for user-aware datetime handling.
 *
 * All datetime display should go through these utilities to ensure
 * consistent timezone handling across the application.
 *
 * Usage:
 *   import { formatDateTime, formatDate, formatTime, getUserTimezone } from '@/lib/timezone';
 *
 *   // Format UTC datetime from API for display
 *   const localString = formatDateTime('2026-04-02T10:00:00Z');
 *
 *   // Get user's timezone name
 *   const tz = getUserTimezone();
 */

import { getAccessToken } from '@/api/axios';
import { STORAGE_KEYS } from '@/constants';

// Common timezone names
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

/**
 * Get user's timezone from storage or browser default.
 *
 * Priority:
 * 1. User's explicit setting from localStorage
 * 2. Browser's timezone
 * 3. UTC fallback
 */
export function getUserTimezone(): string {
  // Try stored preference first
  const stored = localStorage.getItem(STORAGE_KEYS.USER_TIMEZONE);
  if (stored) return stored;

  // Try browser timezone
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz) return browserTz;
  } catch {
    // Intl not supported, fall through
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
  localStorage.removeItem(TIMEZONE_STORAGE_KEY);
}

/**
 * Convert UTC ISO string to Date object in user's local timezone.
 *
 * @param utcString - UTC datetime string from API (e.g., "2026-04-02T10:00:00Z")
 * @returns Date object representing that moment in time
 */
export function utcToLocalDate(utcString: string | null | undefined): Date | null {
  if (!utcString) return null;

  try {
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Format a UTC datetime string for display in user's local timezone.
 *
 * @param utcString - UTC datetime from API
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted string, or empty string if input invalid
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

/**
 * Check if a UTC datetime string is "today" in user's local timezone.
 *
 * @param utcString - UTC datetime from API
 * @returns true if the datetime falls on user's local "today"
 */
export function isToday(utcString: string | null | undefined): boolean {
  const date = utcToLocalDate(utcString);
  if (!date) return false;

  const tz = getUserTimezone();
  const now = new Date();

  // Format both dates in user's timezone and compare date portion
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
 * Check if a UTC datetime string is in the past (relative to user's local time).
 *
 * @param utcString - UTC datetime from API
 * @returns true if the datetime is before now in user's local timezone
 */
export function isPast(utcString: string | null | undefined): boolean {
  const date = utcToLocalDate(utcString);
  if (!date) return false;

  return date.getTime() < Date.now();
}

/**
 * Get start and end of "today" in user's timezone, returned as ISO strings.
 *
 * Useful for filtering tasks/events due today.
 *
 * @returns Object with start and end ISO strings in UTC
 */
export function getTodayRange(): { start: string; end: string } {
  const tz = getUserTimezone();
  const now = new Date();

  // Create start of today in user's timezone
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

  // Create date at start of day in user's timezone
  const startLocal = new Date(`${year}-${month}-${day}T00:00:00`);
  const endLocal = new Date(`${year}-${month}-${day}T23:59:59.999`);

  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
  };
}

/**
 * Get current date and time strings in user's local timezone.
 *
 * @returns Tuple of [dateString, timeString]
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
