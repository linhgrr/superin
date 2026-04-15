/**
 * Calendar event helpers — domain logic for event grouping, positioning, and formatting.
 *
 * Design rule: This is a calendar-specific domain utility.
 * All timezone-aware operations delegate to @/shared/utils/datetime.
 * All functions here REQUIRE an explicit `timezone` parameter — no hidden fallback.
 */

import type { EventRead } from "../api";
import { getHourMinute, isSameDayAs } from "@/shared/utils/datetime";

// ─── Filtering ────────────────────────────────────────────────────────────────

/**
 * Tạo một hue từ string để render màu ngẫu nhiên nhưng ổn định cho event
 */
export function getHueFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function getColorStyleForEvent(eventId: string): React.CSSProperties {
  const hue = getHueFromString(eventId);
  return {
    '--event-hue': String(hue),
  } as React.CSSProperties;
}

interface FilterEventsProps {
  events: EventRead[];
  selectedCalendar: string | null;
}

export function filterEventsByCalendar({ events, selectedCalendar }: FilterEventsProps) {
  return selectedCalendar
    ? events.filter((e) => e.calendar_id === selectedCalendar)
    : events;
}

// ─── Grouping ───────────────────────────────────────────────────────────────

/**
 * Group events by calendar day in the user's timezone.
 * Groups are ordered by date key (YYYY-MM-DD).
 *
 * @param events   - List of events (from API, UTC ISO strings)
 * @param timezone - IANA timezone (e.g. "Asia/Ho_Chi_Minh"). Required.
 */
export function groupEventsByDate(
  events: EventRead[],
  timezone: string,
): Record<string, { label: string; events: EventRead[] }> {
  return events.reduce((acc, event) => {
    // isSameDayAs uses Intl.DateTimeFormat with explicit timezone
    const dateKey = _getDateKey(event.start_datetime, timezone);
    const dateLabel = _getDateLabel(event.start_datetime, timezone);

    if (!acc[dateKey]) {
      acc[dateKey] = { label: dateLabel, events: [] };
    }
    acc[dateKey].events.push(event);
    return acc;
  }, {} as Record<string, { label: string; events: EventRead[] }>);
}

/**
 * Filter events that fall on a specific calendar day (user timezone).
 *
 * @param events   - Events to filter
 * @param date     - Reference date (e.g. a day column in week grid)
 * @param timezone - IANA timezone (e.g. "Asia/Ho_Chi_Minh"). Required.
 */
export function getEventsForDay(
  events: EventRead[],
  date: Date,
  timezone: string,
): EventRead[] {
  return events.filter((e) => isSameDayAs(e.start_datetime, date, timezone));
}

// ─── Date key/label helpers (Intl-based, explicit timezone) ──────────────────

function _getDateKey(utcString: string, timezone: string): string {
  const date = new Date(utcString);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function _getDateLabel(utcString: string, timezone: string): string {
  const date = new Date(utcString);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

// ─── Positioned event types ───────────────────────────────────────────────────

/** An event annotated with computed layout fields for the week grid. */
export interface PositionedEvent {
  event: EventRead;
  topMinutes: number;   // minutes from midnight in user timezone (0–1439)
  heightMinutes: number; // duration in minutes
  leftFrac: number;     // 0–1 fraction across the column
  widthFrac: number;     // 0–1 fraction of column width
  zIndex: number;        // stacking z-index
}

/**
 * Compute x-position for overlapping events within one day column,
 * using the user's timezone for hour extraction.
 *
 * Uses a greedy column-packing algorithm:
 *   1. Events are sorted by start time, then by duration (shorter first).
 *   2. Each event is placed in the first column where it doesn't overlap.
 *   3. "leftFrac" is the column index / total columns, "widthFrac" is 1 / total columns.
 *
 * @param events   - Events for one day (from API, UTC ISO strings)
 * @param timezone - IANA timezone (e.g. "Asia/Ho_Chi_Minh"). Required.
 */
export function computeOverlappingEvents(
  events: EventRead[],
  timezone: string,
): PositionedEvent[] {
  if (!events.length) return [];

  // Extract start/end minutes in the USER'S timezone (not browser local!)
  const withMinutes = events.map((e) => {
    const startResult = getHourMinute(e.start_datetime, timezone);
    const endResult = getHourMinute(e.end_datetime, timezone);
    const start = startResult ? startResult.hour * 60 + startResult.minute : 0;
    const end = endResult ? endResult.hour * 60 + endResult.minute : start + 30;
    return { event: e, start, end, dur: end - start };
  });

  // Sort by start time, then duration
  withMinutes.sort((a, b) => a.start - b.start || a.dur - b.dur);

  const result: PositionedEvent[] = [];
  let cluster: typeof withMinutes = [];
  let clusterEnd = 0;

  const processCluster = (cls: typeof withMinutes) => {
    const columns: number[] = [];
    const itemCols = cls.map(item => {
      let col = columns.findIndex(colEnd => colEnd <= item.start);
      if (col === -1) {
        col = columns.length;
        columns.push(item.end);
      } else {
        columns[col] = Math.max(columns[col], item.end);
      }
      return col;
    });

    cls.forEach((item, index) => {
      const col = itemCols[index];
      // Thụt vào 15% cho mỗi level overlapping
      const indentFrac = 0.15;
      const leftFrac = col * indentFrac;
      // Dành 8% bên phải để click tạo mới. Vậy right luôn bằng 92%.
      // Card sẽ hẹp dần, đảm bảo độ rộng tối thiểu là 20% nếu overlap quá dày
      const minWidth = 0.15;
      const calculatedWidth = 0.92 - leftFrac;
      const widthFrac = Math.max(calculatedWidth, minWidth);

      result.push({
        event: item.event,
        topMinutes: item.start,
        heightMinutes: item.dur,
        leftFrac,
        widthFrac,
        zIndex: col === 0 ? 5 : 10 + col,
      });
    });
  };

  for (const item of withMinutes) {
    if (cluster.length === 0) {
      cluster.push(item);
      clusterEnd = item.end;
    } else if (item.start < clusterEnd) {
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    } else {
      processCluster(cluster);
      cluster = [item];
      clusterEnd = item.end;
    }
  }

  if (cluster.length > 0) {
    processCluster(cluster);
  }

  return result;
}

/**
 * Compute absolute pixel position for an overlapping event in a day column.
 * Uses percentage for horizontal layout so it's resolution-independent.
 */
export function computeEventPosition(
  leftFrac: number,
  widthFrac: number,
  topMinutes: number,
  heightMinutes: number,
  hourHeight: number,
) {
  const GAP = 0.5;
  const top = (topMinutes / 60) * hourHeight;
  const height = Math.max((heightMinutes / 60) * hourHeight - 2, 20);
  const usable = 100 - GAP * 2;
  const left = GAP + leftFrac * usable;
  const width = Math.max(widthFrac * usable - GAP * 2, 4);

  return { top: `${top}px`, height: `${height}px`, left: `${left}%`, width: `${width}%` };
}

/**
 * Split events into all-day vs timed based on whether they span midnight
 * in the user's timezone.
 *
 * All-day events are those whose end_datetime is the same calendar day as
 * their start_datetime in the user's timezone (i.e. they don't cross midnight).
 */
export function splitEventsByType(events: EventRead[], timezone: string): {
  allDay: EventRead[];
  timed: EventRead[];
} {
  const allDay: EventRead[] = [];
  const timed: EventRead[] = [];

  for (const event of events) {
    const start = new Date(event.start_datetime);
    const end = new Date(event.end_datetime);
    const startDay = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
    const endDay = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(end);
    if (startDay === endDay) {
      allDay.push(event);
    } else {
      timed.push(event);
    }
  }

  return { allDay, timed };
}

/**
 * Format UTC ISO datetime to time string (HH:MM) in the user's timezone.
 *
 * @param utcString - UTC ISO string
 * @param timezone  - IANA timezone (required — callers must pass from useTimezone())
 */
export function formatEventTime(utcString: string, timezone: string): string {
  const date = new Date(utcString);
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}
