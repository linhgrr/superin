import type { EventRead } from "../api";
import { isSameDayInTimezone } from "../utils/dateHelpers";

interface FilterEventsProps {
  events: EventRead[];
  selectedCalendar: string | null;
}

export function filterEventsByCalendar({ events, selectedCalendar }: FilterEventsProps) {
  return selectedCalendar
    ? events.filter((e) => e.calendar_id === selectedCalendar)
    : events;
}

interface GroupEventsOptions {
  timezone?: string;
}

export function groupEventsByDate(events: EventRead[], options: GroupEventsOptions = {}) {
  const { timezone } = options;
  return events.reduce((acc, event) => {
    const dateObj = new Date(event.start_datetime);
    // Use user's timezone for date key and label
    const dateKey = dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone,
    }).split("/").reverse().join("-"); // Convert MM/DD/YYYY to YYYY-MM-DD

    const dateLabel = dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: timezone,
    });
    if (!acc[dateKey]) {
      acc[dateKey] = { label: dateLabel, events: [] };
    }
    acc[dateKey].events.push(event);
    return acc;
  }, {} as Record<string, { label: string; events: EventRead[] }>);
}

interface GetEventsOptions {
  timezone?: string;
}

export function getEventsForDay(events: EventRead[], date: Date, options: GetEventsOptions = {}) {
  const { timezone } = options;
  return events.filter((e) => isSameDayInTimezone(new Date(e.start_datetime), date, timezone));
}

export function calculateEventStyle(event: EventRead, hourHeight: number = 60) {
  const start = new Date(event.start_datetime);
  const end = new Date(event.end_datetime);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  return {
    top: `${startHour * hourHeight}px`,
    height: `${Math.max(duration * hourHeight - 2, 20)}px`,
  };
}
