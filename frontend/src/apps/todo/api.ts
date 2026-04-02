/**
 * Todo App API — tasks CRUD.
 *
 * Plug-n-play: Self-contained, no dependency on global app-specific constants.
 */

import type { CreateTaskRequest, UpdateTaskRequest } from "@/types/generated/api";
import { api } from "@/api/client";

const BASE = "/api/apps/todo";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskRead {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  created_at: string;
  completed_at: string | null;
}

export interface TodoSummary {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  due_today: number;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getTasks(params?: {
  status?: "pending" | "completed";
  priority?: "low" | "medium" | "high";
}): Promise<TaskRead[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.priority) qs.set("priority", params.priority);
  const query = qs.toString();
  return api.get<TaskRead[]>(`${BASE}/tasks${query ? `?${query}` : ""}`);
}

export async function createTask(payload: CreateTaskRequest): Promise<TaskRead> {
  return api.post<TaskRead>(`${BASE}/tasks`, payload);
}

export async function updateTask(id: string, payload: UpdateTaskRequest): Promise<TaskRead> {
  return api.patch<TaskRead>(`${BASE}/tasks/${id}`, payload);
}

export async function deleteTask(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/tasks/${id}`);
}

export async function toggleTask(id: string): Promise<TaskRead> {
  return api.patch<TaskRead>(`${BASE}/tasks/${id}/toggle`);
}

// ─── Summary ────────────────────────────────────────────────────────────────────

export async function getTodoSummary(): Promise<TodoSummary> {
  return api.get<TodoSummary>(`${BASE}/summary`);
}

// ─── Subtasks ─────────────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  parent_task_id: string;
  title: string;
  completed: boolean;
  created_at: string;
  completed_at: string | null;
}

export async function getSubtasks(taskId: string): Promise<SubTask[]> {
  return api.get<SubTask[]>(`${BASE}/tasks/${taskId}/subtasks`);
}

export async function createSubtask(taskId: string, title: string): Promise<SubTask> {
  return api.post<SubTask>(`${BASE}/tasks/${taskId}/subtasks`, { title });
}

export async function completeSubtask(subtaskId: string): Promise<SubTask> {
  return api.patch<SubTask>(`${BASE}/subtasks/${subtaskId}/complete`);
}

export async function uncompleteSubtask(subtaskId: string): Promise<SubTask> {
  return api.patch<SubTask>(`${BASE}/subtasks/${subtaskId}/uncomplete`);
}

export async function deleteSubtask(subtaskId: string): Promise<void> {
  return api.delete<void>(`${BASE}/subtasks/${subtaskId}`);
}

// ─── Recurring Rules ──────────────────────────────────────────────────────────

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringRule {
  id: string;
  task_template_id: string;
  frequency: RecurringFrequency;
  interval: number;
  days_of_week: number[] | null;
  end_date: string | null;
  max_occurrences: number | null;
  occurrence_count: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateRecurringRuleData {
  frequency: RecurringFrequency;
  interval: number;
  days_of_week?: number[];
  end_date?: string;
  max_occurrences?: number;
}

export async function createRecurringRule(
  taskId: string,
  data: CreateRecurringRuleData
): Promise<RecurringRule> {
  return api.post<RecurringRule>(`${BASE}/tasks/${taskId}/recurring`, data);
}

export async function getRecurringRules(): Promise<RecurringRule[]> {
  return api.get<RecurringRule[]>(`${BASE}/recurring`);
}

export async function stopRecurringRule(ruleId: string): Promise<RecurringRule> {
  return api.patch<RecurringRule>(`${BASE}/recurring/${ruleId}/stop`);
}
