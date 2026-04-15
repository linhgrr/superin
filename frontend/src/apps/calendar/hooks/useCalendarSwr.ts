/**
 * Calendar App SWR Hooks
 *
 * Plug-n-play: Self-contained, only imports from shared lib and own app.
 */

import useSWR from "swr";
import { swrConfig, mutateByPrefix } from "@/lib/swr";
import {
  checkConflicts as apiCheckConflicts,
  createCalendar as apiCreateCalendar,
  createEvent as apiCreateEvent,
  createRecurringRule as apiCreateRecurringRule,
  deleteEvent as apiDeleteEvent,
  getEvent as apiGetEvent,
  getCalendars as apiListCalendars,
  getEvents as apiListEvents,
  scheduleTask as apiScheduleTask,
  stopRecurringRule as apiStopRecurringRule,
  updateEvent as apiUpdateEvent,
  type CalendarRead,
  type CreateCalendarRequest,
  type CreateEventRequest,
  type CreateRecurringRuleRequest,
  type EventRead,
  type RecurringRuleRead,
  type ScheduleTaskRequest,
  type UpdateEventRequest,
} from "../api";

// ─── Read Hooks ──────────────────────────────────────────────────────────────

export function useCalendars() {
  return useSWR<CalendarRead[]>("calendar/calendars", apiListCalendars, swrConfig);
}

export function useEvents(start?: string, end?: string, calendarId?: string, limit = 100) {
  return useSWR<EventRead[]>(
    ["calendar/events", start, end, calendarId, limit],
    () => apiListEvents({ start, end, calendar_id: calendarId, limit }),
    { ...swrConfig, refreshInterval: 60000 }
  );
}

export function useEvent(eventId: string | null) {
  return useSWR<EventRead>(
    eventId ? ["calendar/event", eventId] : null,
    () => apiGetEvent(eventId!),
    swrConfig
  );
}

export function useUpcomingEvents(maxItems = 3) {
  return useSWR<EventRead[]>(
    ["calendar/events/upcoming", maxItems],
    async () => {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const events = await apiListEvents({ start: now, end, limit: maxItems });
      return events.slice(0, maxItems);
    },
    { ...swrConfig, refreshInterval: 60000 }
  );
}

export function useConflicts(start: string, end: string, excludeEventId?: string) {
  return useSWR<EventRead[]>(
    ["calendar/conflicts", start, end, excludeEventId],
    () => apiCheckConflicts({ start, end, exclude_event_id: excludeEventId }),
    { ...swrConfig, dedupingInterval: 5000 }
  );
}

export async function createEvent(request: CreateEventRequest): Promise<EventRead> {
  const result = await apiCreateEvent(request);
  mutateByPrefix("calendar/events");
  return result;
}

export async function createCalendar(request: CreateCalendarRequest): Promise<CalendarRead> {
  const result = await apiCreateCalendar(request);
  mutateByPrefix("calendar/calendars");
  return result;
}

export async function updateEvent(eventId: string, request: UpdateEventRequest): Promise<EventRead> {
  const result = await apiUpdateEvent(eventId, request);
  mutateByPrefix("calendar/events");
  return result;
}

export async function deleteEvent(eventId: string): Promise<void> {
  await apiDeleteEvent(eventId);
  mutateByPrefix("calendar/events");
}

export async function createRecurringRule(
  eventId: string,
  request: CreateRecurringRuleRequest
): Promise<RecurringRuleRead> {
  const result = await apiCreateRecurringRule(eventId, request);
  mutateByPrefix("calendar/events");
  return result;
}

export async function stopRecurringRule(ruleId: string): Promise<RecurringRuleRead> {
  const result = await apiStopRecurringRule(ruleId);
  mutateByPrefix("calendar/events");
  return result;
}

export async function scheduleTask(
  taskId: string,
  request: ScheduleTaskRequest
): Promise<EventRead> {
  const result = await apiScheduleTask(taskId, request);
  mutateByPrefix("calendar/events");
  return result;
}
