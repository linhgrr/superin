/**
 * Todo App SWR Hooks
 *
 * Plug-n-play: Self-contained, only imports from shared lib and own app.
 */

import useSWR from "swr";
import { swrConfig, mutateByPrefix } from "@/lib/swr";
import {
  createRecurringRule as apiCreateRecurringRule,
  createSubtask as apiCreateSubtask,
  createTask as apiCreateTask,
  deleteSubtask as apiDeleteSubtask,
  deleteTask as apiDeleteTask,
  getSubtasks as apiGetSubtasks,
  getTasks as apiGetTasks,
  getTodoSummary as apiGetTodoSummary,
  toggleTask as apiToggleTask,
  completeSubtask as apiCompleteSubtask,
  uncompleteSubtask as apiUncompleteSubtask,
  updateTask as apiUpdateTask,
} from "../api";
import type {
  CreateRecurringRuleRequest,
  CreateTaskRequest,
  RecurringRuleRead,
  SubTaskRead,
  TaskRead,
  SummaryResponse,
  UpdateTaskRequest,
} from "../api";

// ─── Read Hooks ──────────────────────────────────────────────────────────────

export function useTodoSummary() {
  return useSWR<SummaryResponse>(
    "todo/summary",
    apiGetTodoSummary,
    { ...swrConfig, refreshInterval: 30000 }
  );
}

export function useTasks() {
  return useSWR<TaskRead[]>("todo/tasks", () => apiGetTasks(), swrConfig);
}

export function useSubtasks(taskId: string | null) {
  return useSWR<SubTaskRead[]>(
    taskId ? ["todo/subtasks", taskId] : null,
    () => apiGetSubtasks(taskId!),
    swrConfig
  );
}

export async function createTask(payload: CreateTaskRequest): Promise<TaskRead> {
  const result = await apiCreateTask(payload);
  mutateByPrefix("todo/tasks");
  mutateByPrefix("todo/summary");
  return result;
}

export async function updateTask(id: string, payload: UpdateTaskRequest): Promise<TaskRead> {
  const result = await apiUpdateTask(id, payload);
  mutateByPrefix("todo/tasks");
  mutateByPrefix("todo/summary");
  return result;
}

export async function toggleTask(id: string): Promise<TaskRead> {
  const result = await apiToggleTask(id);
  mutateByPrefix("todo/tasks");
  mutateByPrefix("todo/summary");
  return result;
}

export async function deleteTask(id: string): Promise<void> {
  await apiDeleteTask(id);
  mutateByPrefix("todo/tasks");
  mutateByPrefix("todo/summary");
}

export async function createSubtask(taskId: string, title: string): Promise<SubTaskRead> {
  const result = await apiCreateSubtask(taskId, { title });
  mutateByPrefix("todo/subtasks");
  mutateByPrefix("todo/tasks");
  return result;
}

export async function completeSubtask(subtaskId: string): Promise<SubTaskRead> {
  const result = await apiCompleteSubtask(subtaskId);
  mutateByPrefix("todo/subtasks");
  mutateByPrefix("todo/tasks");
  return result;
}

export async function uncompleteSubtask(subtaskId: string): Promise<SubTaskRead> {
  const result = await apiUncompleteSubtask(subtaskId);
  mutateByPrefix("todo/subtasks");
  mutateByPrefix("todo/tasks");
  return result;
}

export async function deleteSubtask(subtaskId: string): Promise<void> {
  await apiDeleteSubtask(subtaskId);
  mutateByPrefix("todo/subtasks");
  mutateByPrefix("todo/tasks");
}

export async function createRecurringRule(
  taskId: string,
  data: CreateRecurringRuleRequest
): Promise<RecurringRuleRead> {
  const result = await apiCreateRecurringRule(taskId, data);
  mutateByPrefix("todo/tasks");
  return result;
}
