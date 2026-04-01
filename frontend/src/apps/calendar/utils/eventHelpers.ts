import type { Event } from "../api";
import { isSameDay } from "../utils/dateHelpers";

interface FilterEventsProps {
  events: Event[];
  selectedCalendar: string | null;
}

export function filterEventsByCalendar({ events, selectedCalendar }: FilterEventsProps) {
  return selectedCalendar
    ? events.filter((e) => e.calendar_id === selectedCalendar)
    : events;
}

export function groupEventsByDate(events: Event[]) {
  return events.reduce((acc, event) => {
    const dateKey = new Date(event.start_datetime).toISOString().split("T")[0];
    const dateObj = new Date(event.start_datetime);
    const dateLabel = dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!acc[dateKey]) {
      acc[dateKey] = { label: dateLabel, events: [] };
    }
    acc[dateKey].events.push(event);
    return acc;
  }, {} as Record<string, { label: string; events: Event[] }>);
}

export function getEventsForDay(events: Event[], date: Date) {
  return events.filter((e) => isSameDay(new Date(e.start_datetime), date));
}

export function calculateEventStyle(event: Event, hourHeight: number = 60) {
  const start = new Date(event.start_datetime);
  const end = new Date(event.end_datetime);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  return {
    top: `${startHour * hourHeight}px`,
    height: `${Math.max(duration * hourHeight - 2, 20)}px`,
  };
}
