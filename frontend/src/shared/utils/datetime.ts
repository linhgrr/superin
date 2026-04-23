/**
 * Comprehensive datetime utilities — SINGLE SOURCE OF TRUTH for all
 * timezone-aware datetime operations on the frontend.
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 *   FE exchanges temporal values with backend according to field semantic:
 *   - instants use UTC ISO strings
 *   - date-only values use YYYY-MM-DD
 *   - time-only values use HH:MM[:SS]
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
 *   ALWAYS convert local calendar components with an explicit IANA timezone
 *           → buildUtcIsoString()/buildUtcIsoStringFromDate() do this safely
 *
 *   ALWAYS use .toISOString() when sending instant datetimes to the backend
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
/** Accepts a semantic local date (`YYYY-MM-DD`), null, or undefined. */
export type LocalDateInput = string | null | undefined;

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

interface TimeZoneDateParts {
  year: number;
  month: number;
  day: number;
}

interface TimeZoneDateTimeParts extends TimeZoneDateParts {
  hour: number;
  minute: number;
  second: number;
}

function getCurrentDate(): Date {
  return new Date(Date.now());
}

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

function getDateTimePartsInTimezone(date: Date, timeZone: string): TimeZoneDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const mapped = {
    year: 1970,
    month: 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  };

  for (const part of parts) {
    if (part.type === 'year') mapped.year = Number(part.value);
    if (part.type === 'month') mapped.month = Number(part.value);
    if (part.type === 'day') mapped.day = Number(part.value);
    if (part.type === 'hour') mapped.hour = Number(part.value);
    if (part.type === 'minute') mapped.minute = Number(part.value);
    if (part.type === 'second') mapped.second = Number(part.value);
  }

  return mapped;
}

function getDatePartsInTimezone(date: Date, timeZone: string): TimeZoneDateParts {
  const { year, month, day } = getDateTimePartsInTimezone(date, timeZone);
  return { year, month, day };
}

function formatDateKey({ year, month, day }: TimeZoneDateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(value: string): TimeZoneDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

function getValidLocalDateParts(value: LocalDateInput): TimeZoneDateParts | null {
  if (typeof value !== 'string') return null;
  return parseDateKey(value);
}

function getLocalDateAnchor(parts: TimeZoneDateParts): Date {
  // Noon UTC avoids accidental day rollover when formatting date-only values.
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
}

function addDaysToDateParts(parts: TimeZoneDateParts, days: number): TimeZoneDateParts {
  const anchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
  };
}

function parseTimeZoneOffsetMinutes(value: string): number {
  if (value === 'GMT' || value === 'UTC') return 0;

  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported timezone offset format: ${value}`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const timeZoneName = parts.find((part) => part.type === 'timeZoneName')?.value;
  if (!timeZoneName) {
    throw new Error(`Unable to resolve timezone offset for ${timeZone}`);
  }

  return parseTimeZoneOffsetMinutes(timeZoneName);
}

function zonedDateTimeToUtcDate(
  parts: TimeZoneDateTimeParts,
  timeZone: string,
  millisecond = 0,
): Date {
  let utcMillis = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    millisecond,
  );

  for (let i = 0; i < 3; i++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMillis), timeZone);
    const nextUtcMillis = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      millisecond,
    ) - offsetMinutes * 60 * 1000;

    if (nextUtcMillis === utcMillis) {
      break;
    }
    utcMillis = nextUtcMillis;
  }

  return new Date(utcMillis);
}

export function getDateKey(value: DateInput, tz?: string): string {
  const date = utcToLocalDate(value);
  if (!date) return '';
  const activeTz = tz ?? getUserTimezone();
  return formatDateKey(getDatePartsInTimezone(date, activeTz));
}

export function shiftDateKey(value: string, days: number): string {
  const parts = parseDateKey(value);
  if (!parts) return '';
  return formatDateKey(addDaysToDateParts(parts, days));
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
 * Format a UTC datetime as a compact weekday + date string in the user's timezone.
 *
 * Default output shape is locale-aware, typically like "Mon, Apr 13".
 */
export function formatWeekdayDate(
  utcString: DateInput,
  tz?: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return formatDate(utcString, tz, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  });
}

/**
 * Format a UTC datetime as a compact weekday + datetime string in the user's timezone.
 *
 * Default output shape is locale-aware, typically like "Mon, Apr 13, 09:30".
 */
export function formatWeekdayDateTime(
  utcString: DateInput,
  tz?: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return formatDateTime(utcString, tz, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

/**
 * Format a UTC datetime as a full weekday + long date string in the user's timezone.
 *
 * Default output shape is locale-aware, typically like "Monday, April 13, 2026".
 */
export function formatLongWeekdayDate(
  utcString: DateInput,
  tz?: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return formatDate(utcString, tz, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  });
}

/**
 * Format a semantic local date (`YYYY-MM-DD`) without applying timezone math.
 */
export function formatLocalDate(
  value: LocalDateInput,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const parts = getValidLocalDateParts(value);
  if (!parts) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
    timeZone: 'UTC',
  }).format(getLocalDateAnchor(parts));
}

/**
 * Format a semantic local date as weekday + date.
 */
export function formatLocalWeekdayDate(
  value: LocalDateInput,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return formatLocalDate(value, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  });
}

/**
 * Format a semantic local date as long weekday + full date.
 */
export function formatLongLocalDate(
  value: LocalDateInput,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return formatLocalDate(value, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  });
}

/**
 * Get current date and time strings in the user's timezone.
 *
 * @param tz - IANA timezone (default: user's active timezone)
 * @returns { date: "YYYY-MM-DD", time: "HH:MM" }
 */
export function getLocalNow(tz?: string): { date: string; time: string } {
  const activeTz = tz ?? getUserTimezone();
  const now = getCurrentDate();
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
 * The conversion uses the user's configured IANA timezone, not the browser's
 * system-local timezone.
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
  tz?: string,
): string {
  const activeTz = tz ?? getUserTimezone();
  return zonedDateTimeToUtcDate(
    {
      year,
      month: month + 1,
      day: date,
      hour,
      minute,
      second,
    },
    activeTz,
  ).toISOString();
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
export function buildUtcIsoStringFromDate(
  date: Date,
  hour: number,
  minute: number,
  tz?: string,
): string {
  const activeTz = tz ?? getUserTimezone();
  const parts = getDatePartsInTimezone(date, activeTz);
  return buildUtcIsoString(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    0,
    activeTz,
  );
}

/**
 * Convert a UTC ISO datetime into a YYYY-MM-DD string for an HTML date input.
 *
 * Uses user-timezone date parts to preserve the calendar day the user selected.
 */
export function toDateInputValue(value: DateInput): string {
  const date = utcToLocalDate(value);
  if (!date) return '';
  return getDateKey(date);
}

/**
 * Normalize a semantic local date for HTML date inputs.
 *
 * Use this for `local_date` fields that already travel as `YYYY-MM-DD`.
 */
export function toLocalDateInputValue(value: LocalDateInput): string {
  const parts = getValidLocalDateParts(value);
  return parts ? formatDateKey(parts) : '';
}

/**
 * Convert a YYYY-MM-DD date input value into a UTC ISO string at midnight in
 * the active user timezone.
 */
export function dateInputValueToUtcIso(value: string): string | null {
  const parts = parseDateKey(value);
  if (!parts) return null;
  return buildUtcIsoString(parts.year, parts.month - 1, parts.day, 0, 0, 0);
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
 * @returns Date[7] — Monday … Sunday, each representing midnight in the user tz
 *
 * @example
 *   getWeekDates(new Date(2026, 3, 13), "Asia/Ho_Chi_Minh")
 *   → [Date13, Date14, ..., Date19] in UTC+7 local time
 */
export function getWeekDates(date: Date, tz?: string): Date[] {
  return getWeekBoundaries(date, tz).weekDatesLocal;
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
  return fmt(date) === fmt(getCurrentDate());
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
  return fmt(date) < fmt(getCurrentDate());
}

/**
 * Check whether a semantic local date is before today in the user's timezone.
 */
export function isLocalDatePast(value: LocalDateInput, tz?: string): boolean {
  const parts = getValidLocalDateParts(value);
  if (!parts) return false;
  return formatDateKey(parts) < getLocalNow(tz).date;
}

/**
 * Check whether a semantic local date is today in the user's timezone.
 */
export function isLocalDateToday(value: LocalDateInput, tz?: string): boolean {
  const parts = getValidLocalDateParts(value);
  if (!parts) return false;
  return formatDateKey(parts) === getLocalNow(tz).date;
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
  const parts = getDatePartsInTimezone(date, activeTz);
  const startLocal = zonedDateTimeToUtcDate({ ...parts, hour: 0, minute: 0, second: 0 }, activeTz, 0);
  const endLocal = zonedDateTimeToUtcDate({ ...parts, hour: 23, minute: 59, second: 59 }, activeTz, 999);

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
  return getDayRange(getCurrentDate(), tz);
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
 *   - rangeStartUtcIso / rangeEndUtcIso: inclusive UTC query range for the full week
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
  rangeStartUtcIso: string;
  rangeEndUtcIso: string;
} {
  const activeTz = tz ?? getUserTimezone();
  const targetParts = getDatePartsInTimezone(date, activeTz);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: activeTz,
    weekday: 'short',
  }).format(date);
  const isoWeekday = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }[weekday] ?? 1;
  const mondayParts = addDaysToDateParts(targetParts, 1 - isoWeekday);

  const weekDatesLocal: Date[] = [];
  const weekDatesUtcIso: string[] = [];
  for (let i = 0; i < 7; i++) {
    const currentParts = addDaysToDateParts(mondayParts, i);
    const startOfDay = zonedDateTimeToUtcDate(
      { ...currentParts, hour: 0, minute: 0, second: 0 },
      activeTz,
      0,
    );
    weekDatesLocal.push(startOfDay);
    weekDatesUtcIso.push(startOfDay.toISOString());
  }

  const rangeStartUtcIso = weekDatesUtcIso[0];
  const rangeEndUtcIso = getDayRange(weekDatesLocal[6], activeTz).end;

  return {
    mondayLocal: weekDatesLocal[0],
    sundayLocal: weekDatesLocal[6],
    weekDatesLocal,
    weekDatesUtcIso,
    rangeStartUtcIso,
    rangeEndUtcIso,
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
