/**
 * useUserTimezone — format dates using user's timezone from settings
 *
 * Provides date formatting functions that respect user's timezone setting.
 * Falls back to browser locale when no timezone is set.
 */

import { useAuth } from "./useAuth";

export function useUserTimezone() {
  const { user } = useAuth();
  const timezone = (user?.settings?.timezone as string) || undefined;

  const formatDate = (
    date: Date | string,
    options: Intl.DateTimeFormatOptions = {}
  ): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "—";

    return d.toLocaleDateString("en-US", {
      ...options,
      timeZone: timezone,
    });
  };

  const formatTime = (
    date: Date | string,
    options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }
  ): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "—";

    return d.toLocaleTimeString("en-US", {
      ...options,
      timeZone: timezone,
    });
  };

  const formatDateTime = (
    date: Date | string,
    options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "—";

    return d.toLocaleString("en-US", {
      ...options,
      timeZone: timezone,
    });
  };

  return {
    timezone,
    formatDate,
    formatTime,
    formatDateTime,
  };
}
