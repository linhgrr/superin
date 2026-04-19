import { getHourMinute } from "@/shared/utils/datetime";

import type { CalendarRead, EventRead } from "../api";

export interface EventFormData {
  title: string;
  startMinutes: number;
  endMinutes: number;
  description: string;
  location: string;
  calendar_id: string;
  is_all_day: boolean;
}

export interface EventFormState {
  calendarId: string;
  description: string;
  endMinutes: number;
  isAllDay: boolean;
  location: string;
  startMinutes: number;
  title: string;
}

export function getInitialMinutes(
  date: Date,
  timezone: string,
  initialEvent?: EventRead,
  initialStartMinutes?: number,
) {
  if (initialEvent) {
    const startLocal = getHourMinute(initialEvent.start_datetime, timezone);
    const endLocal = getHourMinute(initialEvent.end_datetime, timezone);

    return {
      start: (startLocal?.hour ?? 0) * 60 + (startLocal?.minute ?? 0),
      end: (endLocal?.hour ?? 1) * 60 + (endLocal?.minute ?? 0),
    };
  }

  if (typeof initialStartMinutes === "number") {
    return { start: initialStartMinutes, end: initialStartMinutes + 60 };
  }

  const startLocal = getHourMinute(date, timezone);
  const start = (startLocal?.hour ?? 9) * 60 + (startLocal?.minute ?? 0);
  return { start, end: start + 60 };
}

export function createInitialEventFormState({
  calendars,
  date,
  initialEvent,
  initialStartMinutes,
  timezone,
}: {
  calendars: CalendarRead[];
  date: Date;
  initialEvent?: EventRead;
  initialStartMinutes?: number;
  timezone: string;
}): EventFormState {
  const initialMinutes = getInitialMinutes(date, timezone, initialEvent, initialStartMinutes);

  return {
    title: initialEvent?.title ?? "",
    description: initialEvent?.description ?? "",
    location: initialEvent?.location ?? "",
    calendarId: initialEvent?.calendar_id ?? calendars[0]?.id ?? "",
    isAllDay: initialEvent?.is_all_day ?? false,
    startMinutes: initialMinutes.start,
    endMinutes: initialMinutes.end,
  };
}

export function normalizeEndMinutes(startMinutes: number, endMinutes: number) {
  return endMinutes > startMinutes ? endMinutes : startMinutes + 30;
}

export function toEventFormData(state: EventFormState): EventFormData {
  return {
    title: state.title.trim(),
    startMinutes: state.startMinutes,
    endMinutes: state.endMinutes,
    description: state.description.trim(),
    location: state.location.trim(),
    calendar_id: state.calendarId,
    is_all_day: state.isAllDay,
  };
}

export function isEventFormValid(state: EventFormState) {
  return Boolean(state.title.trim() && state.calendarId && state.endMinutes > state.startMinutes);
}
