/**
 * React hook for timezone-aware datetime handling.
 *
 * This hook provides timezone utilities that automatically sync with
 * the user's timezone setting from the API.
 *
 * Usage:
 *   const { formatDateTime, isToday, timezone } = useTimezone();
 *   const displayDate = formatDateTime(task.due_date);
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  formatDateTime as formatDateTimeUtil,
  formatDate as formatDateUtil,
  formatTime as formatTimeUtil,
  isToday as isTodayUtil,
  isPast as isPastUtil,
  getUserTimezone,
  setUserTimezone,
  getLocalDateTimeStrings,
} from '@/lib/timezone';

export interface UseTimezoneReturn {
  /** Current user timezone name (e.g., "Asia/Ho_Chi_Minh") */
  timezone: string;

  /** Update the timezone setting */
  setTimezone: (tz: string) => void;

  /** Format UTC datetime string for display */
  formatDateTime: (utcString: string | null | undefined) => string;

  /** Format date only (no time) */
  formatDate: (utcString: string | null | undefined, options?: Intl.DateTimeFormatOptions) => string;

  /** Format time only (no date) */
  formatTime: (utcString: string | null | undefined) => string;

  /** Check if datetime is today in user's timezone */
  isToday: (utcString: string | null | undefined) => boolean;

  /** Check if datetime is in the past */
  isPast: (utcString: string | null | undefined) => boolean;

  /** Get current date/time strings in user's timezone */
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
    if (user?.settings?.timezone) {
      setUserTimezone(user.settings.timezone);
      setTimezoneState(user.settings.timezone);
    }
  }, [user?.settings?.timezone]);

  const setTimezone = useCallback((tz: string) => {
    setUserTimezone(tz);
    setTimezoneState(tz);
  }, []);

  const formatDateTime = useCallback(
    (utcString: string | null | undefined) => formatDateTimeUtil(utcString),
    []
  );

  const formatDate = useCallback(
    (utcString: string | null | undefined, options?: Intl.DateTimeFormatOptions) =>
      formatDateUtil(utcString, options),
    []
  );

  const formatTime = useCallback(
    (utcString: string | null | undefined) => formatTimeUtil(utcString),
    []
  );

  const isToday = useCallback(
    (utcString: string | null | undefined) => isTodayUtil(utcString),
    []
  );

  const isPast = useCallback(
    (utcString: string | null | undefined) => isPastUtil(utcString),
    []
  );

  const getNow = useCallback(() => getLocalDateTimeStrings(), []);

  return {
    timezone,
    setTimezone,
    formatDateTime,
    formatDate,
    formatTime,
    isToday,
    isPast,
    getNow,
  };
}
