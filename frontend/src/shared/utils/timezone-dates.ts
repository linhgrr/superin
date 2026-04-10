/**
 * Pure date-level helpers — checks and ranges in user's timezone.
 * No side effects, no React dependency.
 */

import { getUserTimezone } from './timezone';

type DateInput = string | Date | null | undefined;

/**
 * Check if a UTC datetime string is "today" in user's local timezone.
 */
export function isToday(utcString: DateInput): boolean {
  const date = typeof utcString === 'string' || utcString instanceof Date ? new Date(utcString as string | Date) : null;
  if (!date || isNaN(date.getTime())) return false;

  const tz = getUserTimezone();

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  return fmt(date) === fmt(new Date());
}

/**
 * Check if a UTC datetime string is in the past.
 */
export function isPast(utcString: DateInput): boolean {
  const date = typeof utcString === 'string' || utcString instanceof Date ? new Date(utcString as string | Date) : null;
  if (!date || isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

/**
 * Get start and end of "today" in user's timezone, returned as UTC ISO strings.
 */
export function getTodayRange(): { start: string; end: string } {
  const tz = getUserTimezone();
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) {
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
