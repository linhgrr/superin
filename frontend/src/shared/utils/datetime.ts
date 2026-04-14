/**
 * Comprehensive datetime utilities — SINGLE SOURCE OF TRUTH for all
 * timezone-aware datetime operations on the frontend.
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 *   FE receives/sends UTC ISO strings from/to backend
 *   All display-side computation uses the user's timezone via Intl.DateTimeFormat
 *
 * ── Golden Rules ──────────────────────────────────────────────────────────────
 *
 *   NEVER  getHours() / getDate() / setHours() / getDay() on a raw Date object
 *           → these use the BROWSER's system timezone, not the user's timezone
 *
 *   NEVER  new Date(year, month, day).setHours(h, m, s, ms)
 *           → setHours mutates in system local time (see CalendarScreen bug history)
 *
 *   NEVER  compare Date objects directly (a < b) when both come from user input
 *           → JavaScript compares in UTC; if dates were constructed locally, results are off
 *
 *   ALWAYS use Intl.DateTimeFormat(..., { timeZone }) for any display or comparison work
 *
 *   ALWAYS use new Date(year, month, day, h, m, s, ms) to construct dates
 *           → this constructor interprets ALL arguments as LOCAL time (not UTC)
 *           → then .toISOString() gives the correct UTC instant
 *
 *   ALWAYS use .toISOString() when sending datetimes to the backend
 *
 * ── Usage Quick-Reference ───────────────────────────────────────────────────
 *
 *   "What time is it right now in user tz?"   → getLocalNow(tz)
 *   "Format a UTC datetime for display?"       → formatTime(utc, tz) / formatDate / formatDateTime
 *   "Is this datetime today in user tz?"       → isToday(utc, tz)
 *   "Build a UTC ISO string from date + time?" → buildUtcIsoString(date, hour, min)
 *   "What week does this date fall in (user)?" → getWeekBoundaries(date, tz)
 *   "What column does this time occupy?"        → getHourMinute(utc, tz) → { hour, min }
 *   "Range of today / a date / this week?"     → getDayRange / getWeekRange
 *
 */

import { STORAGE_KEYS } from '@/constants/storage';

/** Accepts a UTC ISO string, a Date object, null, or undefined. */
export type DateInput = string | Date | null | undefined;

// ─── Constants ─────────────────────────────────────────────────────────────────

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

// ─── User timezone ─────────────────────────────────────────────────────────────

/**
 * Get the user's active timezone.
 *
 * Priority:
 *   1. Explicit user setting in localStorage
 *   2. Browser's system timezone
 *   3. UTC fallback
 */
export function getUserTimezone(): string {
  const stored = localStorage.getItem(STORAGE_KEYS.USER_TIMEZONE);
  if (stored) return stored;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Persist the user's timezone preference. */
export function setUserTimezone(tz: string): void {
  localStorage.setItem(STORAGE_KEYS.USER_TIMEZONE, tz);
}

/** Clear stored timezone (call on logout). */
export function clearUserTimezone(): void {
  localStorage.removeItem(STORAGE_KEYS.USER_TIMEZONE);
}

// ─── UTC string ↔ Date object ─────────────────────────────────────────────────

/**
 * Parse a UTC ISO string (or Date) into a browser Date object.
 * Returns null for null/undefined/invalid input.
 *
 * NOTE: The resulting Date is in the browser's LOCAL time.
 * Use format*() functions (which apply user timezone) for display.
 */
export function utcToLocalDate(value: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

// ─── Formatters (user timezone) ────────────────────────────────────────────────

/**
 * Format a UTC datetime as a TIME string (HH:MM) in the user's timezone.
 *
 * @param utcString  - UTC ISO string (e.g. "2026-04-13T02:00:00Z")
 * @param tz          - IANA timezone (default: user's active timezone)
 * @param opts        - Intl options override (e.g. { hour12: true })
 */
export function formatTime(
  utcString: DateInput,
  tz?: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const date = utcToLocalDate(utcString);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
    timeZone: tz ?? getUserTimezone(),
  }).format(date);
}

/**
 * Format a UTC datetime as a DATE string in the user's timezone.
 *
 * @param utcString - UTC ISO string
 * @param tz        - IANA timezone (default: user's active timezone)
 * @param opts      - Intl options override (e.g. { month: 'long' })
 */
export function formatDate(
  utcString: DateInput,
  tz?: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const date = utcToLocalDate(utcString);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
    timeZone: tz ?? getUserTimezone(),
  }).format(date);
}

/**
 * Format a UTC datetime as a DATETIME string in the user's timezone.
 *
 * @param utcString - UTC ISO string
 * @param tz        - IANA timezone (default: user's active timezone)
 * @param opts      - Intl options override
 */
export function formatDateTime(
  utcString: DateInput,
  tz?: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const date = utcToLocalDate(utcString);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
    timeZone: tz ?? getUserTimezone(),
  }).format(date);
}

/**
 * Get current date and time strings in the user's timezone.
 *
 * @param tz - IANA timezone (default: user's active timezone)
 * @returns { date: "YYYY-MM-DD", time: "HH:MM" }
 */
export function getLocalNow(tz?: string): { date: string; time: string } {
  const activeTz = tz ?? getUserTimezone();
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: activeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const timeStr = new Intl.DateTimeFormat(undefined, {
    timeZone: activeTz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return { date: dateStr, time: timeStr };
}

// ─── Date construction (UTC ISO string from local components) ─────────────────

/**
 * Build a UTC ISO string from year/month/day + hour/minute.
 *
 * This is the CORRECT way to create a UTC datetime from date/time picker values.
 * The Date constructor with explicit args interprets everything as LOCAL time,
 * and .toISOString() then produces the correct UTC offset.
 *
 * @param year   - Full year (e.g. 2026)
 * @param month  - Month index 0-11
 * @param date   - Day of month 1-31
 * @param hour   - Hour 0-23
 * @param minute - Minute 0-59
 * @param second - Second 0-59 (default: 0)
 * @returns UTC ISO string (e.g. "2026-04-13T02:00:00Z" for UTC+7 input 09:00)
 *
 * @example
 *   buildUtcIsoString(2026, 3, 13, 9, 0)  // 09:00 in UTC+7
 *   → "2026-04-13T02:00:00Z"
 */
export function buildUtcIsoString(
  year: number,
  month: number,
  date: number,
  hour: number,
  minute: number,
  second = 0,
): string {
  const localDate = new Date(year, month, date, hour, minute, second, 0);
  return localDate.toISOString();
}

/**
 * Build UTC ISO from a Date object (from date picker) + hour/minute.
 *
 * @param date   - Date object (from date picker; midnight is local time)
 * @param hour   - Hour from time picker
 * @param minute - Minute from time picker
 * @returns UTC ISO string
 *
 * @example
 *   buildUtcIsoStringFromDate(datePickerDate, 9, 0)
 *   → "2026-04-13T02:00:00Z"  (UTC+7 09:00 → stored as UTC)
 */
export function buildUtcIsoStringFromDate(date: Date, hour: number, minute: number): string {
  // Use LOCAL methods — weekDatesLocal from getWeekBoundaries() are at local midnight.
  // buildUtcIsoString() constructs via new Date(year, month, date, h, m, s, ms) which
  // interprets all arguments as LOCAL time, then .toISOString() converts to UTC.
  // Using getUTC*() here would extract the WRONG date when local midnight falls on
  // the previous day in UTC (e.g., April 17 00:00 UTC+7 = April 16 17:00 UTC).
  return buildUtcIsoString(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
  );
}

// ─── Date-part extraction (in user's timezone) ──────────────────────────────────

/**
 * Extract hour and minute from a UTC datetime in the user's timezone.
 *
 * NOTE: This replaces raw d.getHours() / d.getMinutes() which use browser local time.
 *
 * @param utcString - UTC ISO string
 * @param tz        - IANA timezone (default: user's active timezone)
 * @returns { hour: 0-23, minute: 0-59 } or null if invalid
 *
 * @example
 *   getHourMinute("2026-04-13T02:00:00Z", "Asia/Ho_Chi_Minh")
 *   → { hour: 9, minute: 0 }
 */
export function getHourMinute(
  utcString: DateInput,
  tz?: string,
): { hour: number; minute: number } | null {
  const date = utcToLocalDate(utcString);
  if (!date) return null;
  const activeTz = tz ?? getUserTimezone();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: activeTz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
    .formatToParts(date)
    .reduce(
      (acc, p) => {
        if (p.type === 'hour') acc.hour = parseInt(p.value, 10);
        if (p.type === 'minute') acc.minute = parseInt(p.value, 10);
        return acc;
      },
      { hour: 0, minute: 0 } as { hour: number; minute: number },
    );
  return parts;
}

/**
 * Check if two Date objects represent the same calendar day in a given timezone.
 *
 * @param d1 - First Date object
 * @param d2 - Second Date object
 * @param tz - IANA timezone (default: user's active timezone)
 */
export function isSameDayInTimezone(d1: Date, d2: Date, tz?: string): boolean {
  const activeTz = tz ?? getUserTimezone();
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: activeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  return fmt(d1) === fmt(d2);
}

/**
 * Get Mon–Sun Date[] (at local midnight in user's tz) for the week containing `date`.
 *
 * @param date - Any date within the desired week
 * @param tz   - IANA timezone (default: user's active timezone)
 * @returns Date[7] — Monday … Sunday, each at local midnight
 *
 * @example
 *   getWeekDates(new Date(2026, 3, 13), "Asia/Ho_Chi_Minh")
 *   → [Date13, Date14, ..., Date19] in UTC+7 local time
 */
export function getWeekDates(date: Date, tz?: string): Date[] {
  const activeTz = tz ?? getUserTimezone();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: activeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce(
      (acc, p) => {
        if (p.type === 'year') acc.year = p.value;
        if (p.type === 'month') acc.month = p.value;
        if (p.type === 'day') acc.day = p.value;
        return acc;
      },
      { year: '1970', month: '01', day: '01' } as Record<string, string>,
    );
  // Construct Date at local midnight — JS interprets "YYYY-MM-DDTHH:MM:SS" as LOCAL time
  const targetDate = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  const dow = targetDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(targetDate);
  monday.setDate(targetDate.getDate() + diffToMon);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ─── Day comparison (in user's timezone) ─────────────────────────────────────

/**
 * Check if a UTC datetime falls within the user's local "today".
 *
 * @param utcString - UTC ISO string
 * @param tz        - IANA timezone (default: user's active timezone)
 */
export function isToday(utcString: DateInput, tz?: string): boolean {
  const date = utcToLocalDate(utcString);
  if (!date) return false;
  const activeTz = tz ?? getUserTimezone();
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: activeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  return fmt(date) === fmt(new Date());
}

/**
 * Check if a UTC datetime is before now in the user's local time.
 *
 * @param utcString - UTC ISO string
 * @param tz        - IANA timezone (default: user's active timezone)
 */
export function isPast(utcString: DateInput, tz?: string): boolean {
  const date = utcToLocalDate(utcString);
  if (!date) return false;
  const activeTz = tz ?? getUserTimezone();
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: activeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  return fmt(date) < fmt(new Date());
}

/**
 * Check if a UTC datetime falls on the same calendar day as a given Date object,
 * compared in the user's timezone.
 *
 * @param utcString - UTC ISO string
 * @param date      - Reference date (e.g. a day column in week grid)
 * @param tz        - IANA timezone (default: user's active timezone)
 */
export function isSameDayAs(utcString: DateInput, date: Date, tz?: string): boolean {
  const d = utcToLocalDate(utcString);
  if (!d) return false;
  const activeTz = tz ?? getUserTimezone();
  const fmt = (dt: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: activeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dt);
  return fmt(d) === fmt(date);
}

// ─── Date ranges ─────────────────────────────────────────────────────────────

/**
 * Get the UTC ISO string range for a calendar day in the user's timezone.
 *
 * @param date - Date object (day to range; time component is ignored)
 * @param tz   - IANA timezone (default: user's active timezone)
 * @returns { start, end } UTC ISO strings
 *
 * @example
 *   getDayRange(new Date(2026, 3, 13), "Asia/Ho_Chi_Minh")
 *   → { start: "2026-04-12T17:00:00Z", end: "2026-04-13T16:59:59.999Z" }
 */
export function getDayRange(date: Date, tz?: string): { start: string; end: string } {
  const activeTz = tz ?? getUserTimezone();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: activeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce(
      (acc, p) => {
        if (p.type === 'year') acc.year = p.value;
        if (p.type === 'month') acc.month = p.value;
        if (p.type === 'day') acc.day = p.value;
        return acc;
      },
      { year: '1970', month: '01', day: '01' } as Record<string, string>,
    );

  const startLocal = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  const endLocal = new Date(`${parts.year}-${parts.month}-${parts.day}T23:59:59.999`);

  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
  };
}

/**
 * Get today's UTC ISO string range in the user's timezone.
 * Convenience wrapper around getDayRange(new Date(), tz).
 */
export function getTodayRange(tz?: string): { start: string; end: string } {
  return getDayRange(new Date(), tz);
}

/**
 * Get the Mon–Sun week boundaries for a given date in the user's timezone.
 *
 * @param date - Any date within the desired week
 * @param tz   - IANA timezone (default: user's active timezone)
 * @returns
 *   - mondayLocal / sundayLocal: Date objects at midnight in user's tz
 *   - weekDatesLocal: Date[7] at local midnight (Mon–Sun)
 *   - weekDatesUtcIso: UTC ISO strings (for API queries)
 *
 * @example
 *   getWeekBoundaries(new Date(2026, 3, 13), "Asia/Ho_Chi_Minh")
 *   → { mondayLocal: Date("2026-04-13T00:00:00+07:00"),
 *       sundayLocal: Date("2026-04-19T00:00:00+07:00"),
 *       weekDatesLocal: [Date13, Date14, ..., Date19],
 *       weekDatesUtcIso: ["2026-04-12T17:00:00Z", ...] }
 */
export function getWeekBoundaries(
  date: Date,
  tz?: string,
): {
  mondayLocal: Date;
  sundayLocal: Date;
  weekDatesLocal: Date[];
  weekDatesUtcIso: string[];
} {
  const activeTz = tz ?? getUserTimezone();

  // Step 1: get calendar day string of `date` in user tz
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: activeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce(
      (acc, p) => {
        if (p.type === 'year') acc.year = p.value;
        if (p.type === 'month') acc.month = p.value;
        if (p.type === 'day') acc.day = p.value;
        return acc;
      },
      { year: '1970', month: '01', day: '01' } as Record<string, string>,
    );

  // Step 2: construct Date at local midnight — JS interprets "YYYY-MM-DDTHH:MM:SS" as LOCAL time
  const dateLocal = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);

  // Step 3: find Monday of that week (ISO: Monday = day 1, Sunday = 0)
  const dow = dateLocal.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mondayLocal = new Date(dateLocal);
  mondayLocal.setDate(dateLocal.getDate() + diffToMon);

  // Step 4: build weekDates[7] (Mon–Sun)
  const weekDatesLocal: Date[] = [];
  const weekDatesUtcIso: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayLocal);
    d.setDate(mondayLocal.getDate() + i);
    weekDatesLocal.push(d);
    weekDatesUtcIso.push(d.toISOString());
  }

  return {
    mondayLocal,
    sundayLocal: weekDatesLocal[6],
    weekDatesLocal,
    weekDatesUtcIso,
  };
}

// ─── Day-of-week ───────────────────────────────────────────────────────────────

/**
 * Get the ISO day-of-week (1=Monday … 7=Sunday) of a UTC datetime in the user's tz.
 *
 * @param utcString - UTC ISO string
 * @param tz        - IANA timezone (default: user's active timezone)
 *
 * @example
 *   getIsoDayOfWeek("2026-04-13T02:00:00Z", "Asia/Ho_Chi_Minh")
 *   // UTC+7: 09:00 Mon → 1
 */
export function getIsoDayOfWeek(utcString: DateInput, tz?: string): number {
  const date = utcToLocalDate(utcString);
  if (!date) return 1;
  const activeTz = tz ?? getUserTimezone();
  const dow = new Intl.DateTimeFormat('en-US', {
    timeZone: activeTz,
    weekday: 'short',
  }).format(date);

  const MAP: Record<string, number> = {
    Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return MAP[dow] ?? 1;
}
