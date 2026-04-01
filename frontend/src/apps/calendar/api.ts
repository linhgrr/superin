import { client } from "@/api/client";

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

// ─── Calendars ───────────────────────────────────────────────────────────────

export async function listCalendars(): Promise<Calendar[]> {
  const res = await client.get("/api/apps/calendar/calendars");
  return res.data as Calendar[];
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

  const res = await client.get(`/api/apps/calendar/events?${params.toString()}`);
  return res.data as Event[];
}

export async function searchEvents(query: string, limit: number = 20): Promise<Event[]> {
  const params = new URLSearchParams();
  params.append("q", query);
  params.append("limit", limit.toString());

  const res = await client.get(`/api/apps/calendar/events/search?${params.toString()}`);
  return res.data as Event[];
}

export async function getEvent(eventId: string): Promise<Event> {
  const res = await client.get(`/api/apps/calendar/events/${eventId}`);
  return res.data as Event;
}

export async function createEvent(request: CreateEventRequest): Promise<Event> {
  const res = await client.post("/api/apps/calendar/events", request);
  return res.data as Event;
}

export async function updateEvent(eventId: string, request: UpdateEventRequest): Promise<Event> {
  const res = await client.patch(`/api/apps/calendar/events/${eventId}`, request);
  return res.data as Event;
}

export async function deleteEvent(eventId: string): Promise<void> {
  await client.delete(`/api/apps/calendar/events/${eventId}`);
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

  const res = await client.get(`/api/apps/calendar/conflicts/check?${params.toString()}`);
  return res.data as Event[];
}

// ─── Recurring Rules ──────────────────────────────────────────────────────────

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

export async function createRecurringRule(
  eventId: string,
  request: CreateRecurringRuleRequest
): Promise<RecurringRule> {
  const res = await client.post(`/api/apps/calendar/events/${eventId}/recurring`, request);
  return res.data as RecurringRule;
}

export async function listRecurringRules(): Promise<RecurringRule[]> {
  const res = await client.get("/api/apps/calendar/recurring");
  return res.data as RecurringRule[];
}

export async function stopRecurringRule(ruleId: string): Promise<RecurringRule> {
  const res = await client.patch(`/api/apps/calendar/recurring/${ruleId}/stop`);
  return res.data as RecurringRule;
}

// ─── Todo Integration ─────────────────────────────────────────────────────────

export interface ScheduleTaskRequest {
  task_id: string;
  start_datetime: string;
  duration_minutes: number;
  calendar_id?: string;
}

export async function scheduleTask(taskId: string, request: Omit<ScheduleTaskRequest, "task_id">): Promise<Event> {
  const res = await client.post(`/api/apps/calendar/tasks/${taskId}/schedule`, request);
  return res.data as Event;
}
