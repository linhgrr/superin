/**
 * Calendar App SWR Hooks
 *
 * Plug-n-play: Self-contained, only imports from shared lib and own app.
 */

import useSWR from "swr";
import { swrConfig, fetcher, mutateByPrefix } from "@/lib/swr";

const BASE = "/api/apps/calendar";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Calendar {
  id: string;
  name: string;
  color: string;
  is_visible: boolean;
  is_default: boolean;
  created_at: string;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_datetime: string;
  end_datetime: string;
  is_all_day: boolean;
  timezone: string;
  calendar_id: string;
  type: "event" | "time_blocked_task";
  task_id: string | null;
  color: string | null;
  is_recurring: boolean;
  reminders: number[];
  created_at: string;
  updated_at: string;
}

export interface CreateEventRequest {
  title: string;
  start_datetime: string;
  end_datetime: string;
  calendar_id: string;
  description?: string | null;
  location?: string | null;
  is_all_day?: boolean;
  type?: "event" | "time_blocked_task";
  task_id?: string | null;
  color?: string | null;
  reminders?: number[];
}

export interface UpdateEventRequest {
  title?: string;
  start_datetime?: string;
  end_datetime?: string;
  calendar_id?: string;
  description?: string | null;
  location?: string | null;
  color?: string | null;
  reminders?: number[];
}

export interface RecurringRule {
  id: string;
  event_template_id: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  days_of_week: number[] | null;
  end_date: string | null;
  max_occurrences: number | null;
  occurrence_count: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateRecurringRuleRequest {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  days_of_week?: number[];
  end_date?: string;
  max_occurrences?: number;
}

export interface ScheduleTaskRequest {
  task_id: string;
  start_datetime: string;
  duration_minutes: number;
  calendar_id?: string;
}

// ─── Read Hooks ──────────────────────────────────────────────────────────────

export function useCalendars() {
  return useSWR<Calendar[]>("calendar/calendars", () => fetcher(`${BASE}/calendars`), swrConfig);
}

export function useEvents(start?: string, end?: string, calendarId?: string, limit = 100) {
  return useSWR<Event[]>(
    ["calendar/events", start, end, calendarId, limit],
    () => {
      const params = new URLSearchParams();
      if (start) params.append("start", start);
      if (end) params.append("end", end);
      if (calendarId) params.append("calendar_id", calendarId);
      params.append("limit", limit.toString());
      return fetcher(`${BASE}/events?${params.toString()}`);
    },
    { ...swrConfig, refreshInterval: 60000 }
  );
}

export function useEvent(eventId: string | null) {
  return useSWR<Event>(
    eventId ? ["calendar/event", eventId] : null,
    () => fetcher(`${BASE}/events/${eventId}`),
    swrConfig
  );
}

export function useUpcomingEvents(maxItems = 3) {
  return useSWR<Event[]>(
    ["calendar/events/upcoming", maxItems],
    async () => {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const params = new URLSearchParams();
      params.append("start", now);
      params.append("end", end);
      params.append("limit", maxItems.toString());
      const events = await fetcher<Event[]>(`${BASE}/events?${params.toString()}`);
      return events.slice(0, maxItems);
    },
    { ...swrConfig, refreshInterval: 60000 }
  );
}

export function useConflicts(start: string, end: string, excludeEventId?: string) {
  return useSWR<Event[]>(
    ["calendar/conflicts", start, end, excludeEventId],
    () => {
      const params = new URLSearchParams();
      params.append("start", start);
      params.append("end", end);
      if (excludeEventId) params.append("exclude_event_id", excludeEventId);
      return fetcher(`${BASE}/conflicts/check?${params.toString()}`);
    },
    { ...swrConfig, dedupingInterval: 5000 }
  );
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function post<T>(path: string, body?: unknown): Promise<T> {
  const { api } = await import("@/api/client");
  return api.post<T>(path, body);
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const { api } = await import("@/api/client");
  return api.patch<T>(path, body);
}

async function del(path: string): Promise<void> {
  const { api } = await import("@/api/client");
  return api.delete<void>(path);
}

export async function createEvent(request: CreateEventRequest): Promise<Event> {
  const result = await post<Event>(`${BASE}/events`, request);
  mutateByPrefix("calendar/events");
  return result;
}

export async function updateEvent(eventId: string, request: UpdateEventRequest): Promise<Event> {
  const result = await patch<Event>(`${BASE}/events/${eventId}`, request);
  mutateByPrefix("calendar/events");
  return result;
}

export async function deleteEvent(eventId: string): Promise<void> {
  await del(`${BASE}/events/${eventId}`);
  mutateByPrefix("calendar/events");
}

export async function createRecurringRule(
  eventId: string,
  request: CreateRecurringRuleRequest
): Promise<RecurringRule> {
  const result = await post<RecurringRule>(`${BASE}/events/${eventId}/recurring`, request);
  mutateByPrefix("calendar/events");
  return result;
}

export async function stopRecurringRule(ruleId: string): Promise<RecurringRule> {
  const result = await patch<RecurringRule>(`${BASE}/recurring/${ruleId}/stop`);
  mutateByPrefix("calendar/events");
  return result;
}

export async function scheduleTask(
  taskId: string,
  request: Omit<ScheduleTaskRequest, "task_id">
): Promise<Event> {
  const result = await post<Event>(`${BASE}/tasks/${taskId}/schedule`, request);
  mutateByPrefix("calendar/events");
  return result;
}
