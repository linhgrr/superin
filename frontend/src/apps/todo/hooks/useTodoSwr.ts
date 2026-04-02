/**
 * Todo App SWR Hooks
 *
 * Plug-n-play: Self-contained, only imports from shared lib and own app.
 */

import useSWR from "swr";
import { swrConfig, fetcher, mutateByPrefix } from "@/lib/swr";
import type { TodoSummary, CreateTaskRequest } from "@/types/generated/api";

const BASE = "/api/apps/todo";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskRead {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  subtask_count: number;
  subtask_completed: number;
  recurring_rule?: { frequency: string; is_active: boolean } | null;
  created_at: string;
  updated_at: string;
}

export interface SubTask {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  created_at: string;
}

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringRule {
  id: string;
  task_id: string;
  frequency: RecurringFrequency;
  interval: number;
  days_of_week: number[] | null;
  end_date: string | null;
  max_occurrences: number | null;
  is_active: boolean;
  created_at: string;
}

// ─── Read Hooks ──────────────────────────────────────────────────────────────

export function useTodoSummary() {
  return useSWR<TodoSummary>(
    "todo/summary",
    () => fetcher(`${BASE}/summary`),
    { ...swrConfig, refreshInterval: 30000 }
  );
}

export function useTasks() {
  return useSWR<TaskRead[]>("todo/tasks", () => fetcher(`${BASE}/tasks`), swrConfig);
}

export function useSubtasks(taskId: string | null) {
  return useSWR<SubTask[]>(
    taskId ? ["todo/subtasks", taskId] : null,
    () => fetcher(`${BASE}/tasks/${taskId}/subtasks`),
    swrConfig
  );
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
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

export async function createTask(payload: CreateTaskRequest): Promise<TaskRead> {
  const result = await post<TaskRead>(`${BASE}/tasks`, payload);
  mutateByPrefix("todo/tasks");
  mutateByPrefix("todo/summary");
  return result;
}

export async function updateTask(id: string, payload: Partial<CreateTaskRequest>): Promise<TaskRead> {
  const result = await patch<TaskRead>(`${BASE}/tasks/${id}`, payload);
  mutateByPrefix("todo/tasks");
  mutateByPrefix("todo/summary");
  return result;
}

export async function toggleTask(id: string): Promise<TaskRead> {
  const result = await patch<TaskRead>(`${BASE}/tasks/${id}/toggle`);
  mutateByPrefix("todo/tasks");
  mutateByPrefix("todo/summary");
  return result;
}

export async function deleteTask(id: string): Promise<void> {
  await del(`${BASE}/tasks/${id}`);
  mutateByPrefix("todo/tasks");
  mutateByPrefix("todo/summary");
}

export async function createSubtask(taskId: string, title: string): Promise<SubTask> {
  const result = await post<SubTask>(`${BASE}/tasks/${taskId}/subtasks`, { title });
  mutateByPrefix("todo/subtasks");
  mutateByPrefix("todo/tasks");
  return result;
}

export async function completeSubtask(subtaskId: string): Promise<SubTask> {
  const result = await patch<SubTask>(`${BASE}/subtasks/${subtaskId}/complete`);
  mutateByPrefix("todo/subtasks");
  mutateByPrefix("todo/tasks");
  return result;
}

export async function uncompleteSubtask(subtaskId: string): Promise<SubTask> {
  const result = await patch<SubTask>(`${BASE}/subtasks/${subtaskId}/uncomplete`);
  mutateByPrefix("todo/subtasks");
  mutateByPrefix("todo/tasks");
  return result;
}

export async function deleteSubtask(subtaskId: string): Promise<void> {
  await del(`${BASE}/subtasks/${subtaskId}`);
  mutateByPrefix("todo/subtasks");
  mutateByPrefix("todo/tasks");
}

export async function createRecurringRule(
  taskId: string,
  data: {
    frequency: RecurringFrequency;
    interval: number;
    days_of_week?: number[];
    end_date?: string;
    max_occurrences?: number;
  }
): Promise<RecurringRule> {
  const result = await post<RecurringRule>(`${BASE}/tasks/${taskId}/recurring`, data);
  mutateByPrefix("todo/tasks");
  return result;
}
