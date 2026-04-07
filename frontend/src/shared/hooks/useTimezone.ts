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
} from '@/shared/utils/timezone';

export interface UseTimezoneReturn {
  /** Current user timezone name (e.g., "Asia/Ho_Chi_Minh") */
  timezone: string;
  /** Update the timezone setting */
  setTimezone: (tz: string) => void;
  /** Format UTC datetime string for display */
  formatDateTime: (utcString: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  /** Format date only (no time) */
  formatDate: (utcString: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  /** Format time only (no date) */
  formatTime: (utcString: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  /** Check if datetime is today in user's timezone */
  isToday: (utcString: string | Date | null | undefined) => boolean;
  /** Check if datetime is in the past */
  isPast: (utcString: string | Date | null | undefined) => boolean;
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
    const timezone = user?.settings?.timezone;
    if (typeof timezone === "string" && timezone.length > 0) {
      setUserTimezone(timezone);
      setTimezoneState(timezone);
    }
  }, [user?.settings?.timezone]);

  const setTimezone = useCallback((tz: string) => {
    setUserTimezone(tz);
    setTimezoneState(tz);
  }, []);

  const formatDateTime = useCallback(
    (utcString: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) =>
      formatDateTimeUtil(utcString, options),
    []
  );

  const formatDate = useCallback(
    (utcString: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) =>
      formatDateUtil(utcString, options),
    []
  );

  const formatTime = useCallback(
    (utcString: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) =>
      formatTimeUtil(utcString, options),
    []
  );

  const isToday = useCallback(
    (utcString: string | Date | null | undefined) => isTodayUtil(utcString),
    []
  );

  const isPast = useCallback(
    (utcString: string | Date | null | undefined) => isPastUtil(utcString),
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
