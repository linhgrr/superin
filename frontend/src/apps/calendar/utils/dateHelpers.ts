// Date helper utilities for calendar components

export const formatTime = (hours: number, minutes: number): string => {
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

export const formatDuration = (startMinutes: number, endMinutes: number): string => {
  const diff = endMinutes - startMinutes;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
};

/**
 * Check if two dates are the same day (in local/browser timezone).
 * @deprecated Use isSameDayInTimezone for timezone-aware comparison.
 */
export const isSameDay = (d1: Date, d2: Date): boolean => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

/**
 * Check if two dates are the same day in the specified timezone.
 */
export const isSameDayInTimezone = (d1: Date, d2: Date, timezone?: string): boolean => {
  if (!timezone) {
    // Fall back to legacy implementation
    return isSameDay(d1, d2);
  }
  const d1Str = d1.toLocaleDateString("en-US", { timeZone: timezone });
  const d2Str = d2.toLocaleDateString("en-US", { timeZone: timezone });
  return d1Str === d2Str;
};

/**
 * Get week dates (Monday-Sunday) relative to the given date.
 * @deprecated Use getWeekDatesInTimezone for timezone-aware calculation.
 */
export const getWeekDates = (date: Date): Date[] => {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust to get Monday
  const monday = new Date(date.setDate(diff));
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d);
  }
  return weekDates;
};

/**
 * Get week dates (Monday-Sunday) relative to the given date in the specified timezone.
 * Returns dates in that timezone's local midnight.
 */
export const getWeekDatesInTimezone = (date: Date, timezone?: string): Date[] => {
  // Get the date components in the target timezone
  const targetDateStr = date.toLocaleDateString("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const [month, day, year] = targetDateStr.split("/").map(Number);

  // Find the Monday of this week
  const targetDate = new Date(year, month - 1, day);
  const dayOfWeek = targetDate.getDay();
  const diff = targetDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(targetDate.setDate(diff));

  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d);
  }
  return weekDates;
};

// Generate 30-min interval options (00:00 - 23:30)
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = (i % 2) * 30;
  return { value: i * 30, label: formatTime(hours, minutes) };
});

export const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0-23 hours
export const HOUR_HEIGHT = 60; // pixels per hour
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
