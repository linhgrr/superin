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
  utcToLocalDate,
  getUserTimezone,
  setUserTimezone,
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

  // Memoize formatters with timezone dependency - fixes stale closure issue
  const formatDateTime = useCallback(
    (utcString: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
      const date = utcToLocalDate(utcString);
      if (!date) return "—";

      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        ...options,
        timeZone: timezone,
      }).format(date);
    },
    [timezone]
  );

  const formatDate = useCallback(
    (utcString: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
      const date = utcToLocalDate(utcString);
      if (!date) return "—";

      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...options,
        timeZone: timezone,
      }).format(date);
    },
    [timezone]
  );

  const formatTime = useCallback(
    (utcString: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
      const date = utcToLocalDate(utcString);
      if (!date) return "—";

      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        ...options,
        timeZone: timezone,
      }).format(date);
    },
    [timezone]
  );

  const isToday = useCallback(
    (utcString: string | null | undefined) => {
      const date = utcToLocalDate(utcString);
      if (!date) return false;

      const now = new Date();

      const dateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

      const todayStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);

      return dateStr === todayStr;
    },
    [timezone]
  );

  const isPast = useCallback(
    (utcString: string | null | undefined) => {
      const date = utcToLocalDate(utcString);
      if (!date) return false;
      return date.getTime() < Date.now();
    },
    []
  );

  const getNow = useCallback((): [string, string] => {
    const now = new Date();

    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const timeStr = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);

    return [dateStr, timeStr];
  }, [timezone]);

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
