/**
 * Todo App API — tasks CRUD.
 */

import type {
  CreateTaskRequest,
  UpdateTaskRequest,
} from "@/types/generated/api";
import { api } from "../client";

const BASE = "/api/apps/todo";

export interface TaskRead {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  created_at: string;
  updated_at: string;
}

// GET /api/apps/todo/tasks
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

// POST /api/apps/todo/tasks
export async function createTask(
  payload: CreateTaskRequest
): Promise<TaskRead> {
  return api.post<TaskRead>(`${BASE}/tasks`, payload);
}

// PATCH /api/apps/todo/tasks/{id}
export async function updateTask(
  id: string,
  payload: UpdateTaskRequest
): Promise<TaskRead> {
  return api.patch<TaskRead>(`${BASE}/tasks/${id}`, payload);
}

// DELETE /api/apps/todo/tasks/{id}
export async function deleteTask(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/tasks/${id}`);
}

// PATCH /api/apps/todo/tasks/{id}/toggle — quick status flip
export async function toggleTask(id: string): Promise<TaskRead> {
  return api.patch<TaskRead>(`${BASE}/tasks/${id}/toggle`);
}

// GET /api/apps/todo/summary — quick stats
export interface TodoSummary {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  due_today: number;
}
export async function getTodoSummary(): Promise<TodoSummary> {
  return api.get<TodoSummary>(`${BASE}/summary`);
}
