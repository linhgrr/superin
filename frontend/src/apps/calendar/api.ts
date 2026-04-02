/**
 * Calendar App API — calendars, events, recurring rules, todo integration.
 *
 * Plug-n-play: Self-contained, no dependency on global app-specific constants.
 */

import { api } from "@/api/client";

const BASE = "/api/apps/calendar";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Calendars ───────────────────────────────────────────────────────────────

export async function listCalendars(): Promise<Calendar[]> {
  return api.get(`${BASE}/calendars`);
}

// ─── Events ────────────────────────────────────────────────────────────────────

export async function listEvents(
  start?: string,
  end?: string,
  calendarId?: string,
  limit: number = 100
): Promise<Event[]> {
  const params = new URLSearchParams();
  if (start) params.append("start", start);
  if (end) params.append("end", end);
  if (calendarId) params.append("calendar_id", calendarId);
  params.append("limit", limit.toString());

  return api.get(`${BASE}/events?${params.toString()}`);
}

export async function searchEvents(query: string, limit: number = 20): Promise<Event[]> {
  const params = new URLSearchParams();
  params.append("q", query);
  params.append("limit", limit.toString());

  return api.get(`${BASE}/events/search?${params.toString()}`);
}

export async function getEvent(eventId: string): Promise<Event> {
  return api.get(`${BASE}/events/${eventId}`);
}

export async function createEvent(request: CreateEventRequest): Promise<Event> {
  return api.post(`${BASE}/events`, request);
}

export async function updateEvent(eventId: string, request: UpdateEventRequest): Promise<Event> {
  return api.patch(`${BASE}/events/${eventId}`, request);
}

export async function deleteEvent(eventId: string): Promise<void> {
  await api.delete(`${BASE}/events/${eventId}`);
}

export async function checkConflicts(
  start: string,
  end: string,
  excludeEventId?: string
): Promise<Event[]> {
  const params = new URLSearchParams();
  params.append("start", start);
  params.append("end", end);
  if (excludeEventId) params.append("exclude_event_id", excludeEventId);

  return api.get(`${BASE}/conflicts/check?${params.toString()}`);
}

// ─── Recurring Rules ──────────────────────────────────────────────────────────

export async function createRecurringRule(
  eventId: string,
  request: CreateRecurringRuleRequest
): Promise<RecurringRule> {
  return api.post(`${BASE}/events/${eventId}/recurring`, request);
}

export async function listRecurringRules(): Promise<RecurringRule[]> {
  return api.get(`${BASE}/recurring`);
}

export async function stopRecurringRule(ruleId: string): Promise<RecurringRule> {
  return api.patch(`${BASE}/recurring/${ruleId}/stop`);
}

// ─── Todo Integration ─────────────────────────────────────────────────────────

export async function scheduleTask(
  taskId: string,
  request: Omit<ScheduleTaskRequest, "task_id">
): Promise<Event> {
  return api.post(`${BASE}/tasks/${taskId}/schedule`, request);
}
