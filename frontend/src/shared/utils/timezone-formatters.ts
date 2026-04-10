/**
 * Display-side formatters — converts UTC ISO strings to local strings.
 * No side effects, no React dependency.
 */

import { getUserTimezone, utcToLocalDate } from './timezone';

type DateInput = string | Date | null | undefined;

/**
 * Format a UTC datetime string for display in user's local timezone.
 */
export function formatDateTime(
  utcString: DateInput,
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
  utcString: DateInput,
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
  utcString: DateInput,
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
