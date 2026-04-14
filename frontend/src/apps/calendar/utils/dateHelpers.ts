/**
 * Calendar-specific pure value helpers — NO timezone logic here.
 *
 * All timezone-aware operations live in:  @/shared/utils/datetime
 * Import from there directly. This file only contains:
 *   - Grid constants  (TIME_OPTIONS, HOURS, DAY_NAMES, HOUR_HEIGHT)
 *   - Time math       (formatTimeOfDay, formatMinutesToString, parseTimeString, formatDuration)
 */

export const formatTimeOfDay = (hours: number, minutes: number): string =>
  `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

export const formatDuration = (startMinutes: number, endMinutes: number): string => {
  const diff = endMinutes - startMinutes;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
};

/** Parse "HH:MM" → total minutes from midnight, or null if invalid. */
export const parseTimeString = (value: string): number | null => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
};

/** Format total minutes from midnight → "HH:MM". */
export const formatMinutesToString = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// ─── Calendar grid constants ───────────────────────────────────────────────────

/** 30-minute interval options for time pickers: [{value: 0, label: "00:00"}, ...] */
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = (i % 2) * 30;
  return { value: i * 30, label: formatTimeOfDay(hours, minutes) };
});

export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const HOUR_HEIGHT = 60; // px per hour row
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── No timezone logic below ──────────────────────────────────────────────────
// For timezone-aware comparisons and week ranges, use:
//   import { isSameDayInTimezone, getWeekDates } from '@/shared/utils/datetime'
