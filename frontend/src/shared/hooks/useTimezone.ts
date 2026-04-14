/**
 * Shared timezone hook — user-aware datetime utilities.
 *
 * Design rule: This hook may ONLY contain pure datetime display logic.
 * NO app-specific business logic, NO app-specific models, NO workspace context.
 *
 * Usage:
 *   import { useTimezone } from '@/shared/hooks/useTimezone';
 *   const { formatDateTime, isToday, timezone } = useTimezone();
 *
 * Apps that need timezone logic import from here (shared/) instead of platform/hooks/.
 * Platform code (src/hooks/, src/lib/) remains off-limits for apps.
 *
 * ── When to use this hook vs direct utils ─────────────────────────────────────
 *
 *   useTimezone()    → React components that need reactive timezone (auto-updates
 *                       when user changes timezone via setTimezone())
 *   direct import    → Non-React code, outside React render cycle
 *
 * ── React components MUST use this hook for: ─────────────────────────────────
 *
 *   formatTime / formatDate / formatDateTime
 *   isToday / isPast / isSameDayAs
 *   getHourMinute / getWeekBoundaries
 *   getDayRange / getTodayRange
 *   getLocalNow
 *
 * ── Pure utilities (no React needed) can use direct import from timezone.ts ───
 *
 *   buildUtcIsoString / buildUtcIsoStringFromDate
 *   getUserTimezone / setUserTimezone / clearUserTimezone
 *   COMMON_TIMEZONES / DEFAULT_TIMEZONE
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  formatTime as formatTimeUtil,
  formatDate as formatDateUtil,
  formatDateTime as formatDateTimeUtil,
  isToday as isTodayUtil,
  isPast as isPastUtil,
  isSameDayAs as isSameDayAsUtil,
  isSameDayInTimezone as isSameDayInTimezoneUtil,
  getHourMinute as getHourMinuteUtil,
  getWeekDates as getWeekDatesUtil,
  getDayRange as getDayRangeUtil,
  getTodayRange as getTodayRangeUtil,
  getWeekBoundaries as getWeekBoundariesUtil,
  getLocalNow as getLocalNowUtil,
  getUserTimezone,
  setUserTimezone,
  type DateInput,
} from '@/shared/utils/datetime';

export interface UseTimezoneReturn {
  /** Current user timezone name (e.g., "Asia/Ho_Chi_Minh") */
  timezone: string;
  /** Update the timezone setting */
  setTimezone: (tz: string) => void;

  // ── Formatters (user timezone) ────────────────────────────────────────────
  /** Format UTC datetime as time string (HH:MM) */
  formatTime: (utcString: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  /** Format UTC datetime as date string */
  formatDate: (utcString: DateInput, options?: Intl.DateTimeFormatOptions) => string;
  /** Format UTC datetime as full datetime string */
  formatDateTime: (utcString: DateInput, options?: Intl.DateTimeFormatOptions) => string;

  // ── Comparisons ────────────────────────────────────────────────────────────
  /** True if UTC datetime falls on today in user timezone */
  isToday: (utcString: DateInput) => boolean;
  /** True if UTC datetime is in the past (user local time) */
  isPast: (utcString: DateInput) => boolean;
  /** True if UTC datetime falls on the same calendar day as `date` (user tz) */
  isSameDayAs: (utcString: DateInput, date: Date) => boolean;

  // ── Extraction ─────────────────────────────────────────────────────────────
  /** Extract hour/minute from UTC datetime in user timezone (for time pickers) */
  getHourMinute: (utcString: DateInput) => { hour: number; minute: number } | null;

  /**
   * Check if two Date objects are the same calendar day in user timezone.
   * Use for comparing a day-column Date with a UTC datetime Date.
   */
  isSameDayInTimezone: (d1: Date, d2: Date) => boolean;

  // ── Ranges ─────────────────────────────────────────────────────────────────
  /** UTC ISO string range for today in user timezone */
  getTodayRange: () => { start: string; end: string };
  /** UTC ISO string range for a specific day in user timezone */
  getDayRange: (date: Date) => { start: string; end: string };
  /** Week boundaries (Mon-Sun) in user timezone */
  getWeekBoundaries: (date: Date) => {
    mondayLocal: Date;
    sundayLocal: Date;
    weekDatesLocal: Date[];
    weekDatesUtcIso: string[];
  };

  // ── Current time ───────────────────────────────────────────────────────────
  /** Current date/time strings in user timezone */
  getNow: () => [string, string];
}

/**
 * Hook for timezone-aware datetime operations.
 *
 * Automatically syncs with user's timezone setting from auth context.
 */
export function useTimezone(): UseTimezoneReturn {
  const { user } = useAuth();
  const [timezone, setTimezoneState] = useState<string>(getUserTimezone());

  // Sync with user settings when available
  useEffect(() => {
    const tz = user?.settings?.timezone;
    if (typeof tz === 'string' && tz.length > 0) {
      setUserTimezone(tz);
      setTimezoneState(tz);
    }
  }, [user?.settings?.timezone]);

  const setTimezone = useCallback((tz: string) => {
    setUserTimezone(tz);
    setTimezoneState(tz);
  }, []);

  const formatTime = useCallback(
    (utcString: DateInput, options?: Intl.DateTimeFormatOptions) =>
      formatTimeUtil(utcString, timezone, options),
    [timezone],
  );

  const formatDate = useCallback(
    (utcString: DateInput, options?: Intl.DateTimeFormatOptions) =>
      formatDateUtil(utcString, timezone, options),
    [timezone],
  );

  const formatDateTime = useCallback(
    (utcString: DateInput, options?: Intl.DateTimeFormatOptions) =>
      formatDateTimeUtil(utcString, timezone, options),
    [timezone],
  );

  const isToday = useCallback(
    (utcString: DateInput) => isTodayUtil(utcString, timezone),
    [timezone],
  );

  const isPast = useCallback(
    (utcString: DateInput) => isPastUtil(utcString, timezone),
    [timezone],
  );

  const isSameDayAs = useCallback(
    (utcString: DateInput, date: Date) => isSameDayAsUtil(utcString, date, timezone),
    [timezone],
  );

  const isSameDayInTimezone = useCallback(
    (d1: Date, d2: Date) => isSameDayInTimezoneUtil(d1, d2, timezone),
    [timezone],
  );

  const getHourMinute = useCallback(
    (utcString: DateInput) => getHourMinuteUtil(utcString, timezone),
    [timezone],
  );

  const getWeekDates = useCallback(
    (date: Date) => getWeekDatesUtil(date, timezone),
    [timezone],
  );

  const getTodayRange = useCallback(
    () => getTodayRangeUtil(timezone),
    [timezone],
  );

  const getDayRange = useCallback(
    (date: Date) => getDayRangeUtil(date, timezone),
    [timezone],
  );

  const getWeekBoundaries = useCallback(
    (date: Date) => getWeekBoundariesUtil(date, timezone),
    [timezone],
  );

  const getNow = useCallback(() => {
    const result = getLocalNowUtil(timezone);
    return [result.date, result.time];
  }, [timezone]);

  return {
    timezone,
    setTimezone,
    formatTime,
    formatDate,
    formatDateTime,
    isToday,
    isPast,
    isSameDayAs,
    isSameDayInTimezone,
    getHourMinute,
    getWeekDates,
    getTodayRange,
    getDayRange,
    getWeekBoundaries,
    getNow,
  };
}
