import { useEffect, useState } from "react";
import {
  completeSubtask,
  createRecurringRule,
  createSubtask,
  createTask,
  deleteSubtask,
  deleteTask,
  getSubtasks,
  getTasks,
  toggleTask,
  type SubTaskRead,
  type TaskRead,
  uncompleteSubtask,
} from "../../api";
import type { CreateRecurringRuleRequest, CreateTaskRequest } from "../../api";
import NewTaskForm from "../../components/NewTaskForm";
import TaskRow from "../../components/TaskRow";
import Modal from "../../components/Modal";
import SubtaskList from "../../components/SubtaskList";
import RecurringRuleForm from "../../components/RecurringRuleForm";
import type { RecurringFrequency } from "../../api";
import { TaskFilters } from "./TaskFilters";

type TaskStatus = TaskRead["status"];
type TaskFilter = "all" | TaskStatus;

export const TASK_FILTER_VALUES = ["all", "pending", "completed"] as const satisfies readonly TaskFilter[];

type TaskListItem = TaskRead & {
  subtask_count?: number;
  subtask_completed?: number;
  recurring_rule?: {
    frequency: RecurringFrequency;
    is_active: boolean;
  } | null;
};

export default function TasksPanel() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null);
  const [subtasks, setSubtasks] = useState<SubTaskRead[]>([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);

  function load() {
    setLoading(true);
    getTasks()
      .then(setTasks)
      .catch((error: unknown) => {
        console.error("Failed to load tasks", error);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(id: string) {
    try {
      const updated = await toggleTask(id);
      setTasks((current) => current.map((task) => (task.id === id ? updated : task)));
    } catch {
      console.error("Failed to toggle task", id);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id);
      setTasks((current) => current.filter((task) => task.id !== id));
    } catch {
      console.error("Failed to delete task", id);
    }
  }

  async function handleCreate(data: CreateTaskRequest) {
    const created = await createTask(data);
    setTasks((current) => [created, ...current]);
    setShowForm(false);
  }

  async function handleSelectTask(task: TaskListItem) {
    if (selectedTask?.id === task.id) {
      setSelectedTask(null);
      setSubtasks([]);
      return;
    }
    setSelectedTask(task);
    setSubtasksLoading(true);
    try {
      const data = await getSubtasks(task.id);
      setSubtasks(data);
    } catch {
      console.error("Failed to load subtasks", task.id);
      setSubtasks([]);
    } finally {
      setSubtasksLoading(false);
    }
  }

  async function handleCreateSubtask(title: string) {
    if (!selectedTask) return;
    const created = await createSubtask(selectedTask.id, { title });
    setSubtasks((current) => [...current, created]);
    setTasks((current) =>
      current.map((t) =>
        t.id === selectedTask.id
          ? { ...t, subtask_count: (t.subtask_count ?? 0) + 1 }
          : t
      )
    );
  }

  async function handleToggleSubtask(subtaskId: string, completed: boolean) {
    const updated = completed
      ? await completeSubtask(subtaskId)
      : await uncompleteSubtask(subtaskId);
    setSubtasks((current) =>
      current.map((s) => (s.id === subtaskId ? updated : s))
    );
    if (selectedTask) {
      const delta = completed ? 1 : -1;
      setTasks((current) =>
        current.map((t) =>
          t.id === selectedTask.id
            ? { ...t, subtask_completed: (t.subtask_completed ?? 0) + delta }
            : t
        )
      );
    }
  }

  async function handleDeleteSubtask(subtaskId: string) {
    const wasCompleted = subtasks.find((s) => s.id === subtaskId)?.completed;
    await deleteSubtask(subtaskId);
    setSubtasks((current) => current.filter((s) => s.id !== subtaskId));
    if (selectedTask) {
      setTasks((current) =>
        current.map((t) =>
          t.id === selectedTask.id
            ? {
                ...t,
                subtask_count: (t.subtask_count ?? 0) - 1,
                subtask_completed: wasCompleted
                  ? (t.subtask_completed ?? 0) - 1
                  : t.subtask_completed,
              }
            : t
        )
      );
    }
  }

  async function handleCreateRecurring(data: CreateRecurringRuleRequest) {
    if (!selectedTask) return;
    const rule = await createRecurringRule(selectedTask.id, data);
    setTasks((current) =>
      current.map((t) =>
        t.id === selectedTask.id
          ? { ...t, recurring_rule: { frequency: rule.frequency, is_active: rule.is_active } }
          : t
      )
    );
    setShowRecurringForm(false);
  }

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const counts = {
    all: tasks.length,
    pending: pendingCount,
    completed: completedCount,
  };

  const filtered =
    filter === "all"
      ? tasks
      : filter === "pending"
        ? tasks.filter((t) => t.status === "pending")
        : tasks.filter((t) => t.status === "completed");

  return (
    <>
      <TaskFilters filter={filter} counts={counts} onFilter={setFilter} />

      {showForm ? (
        <NewTaskForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
          style={{ marginBottom: "1.25rem" }}
        >
          + New Task
        </button>
      )}

      {loading ? (
        <p style={{ color: "var(--color-foreground-muted)" }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--color-foreground-muted)", textAlign: "center", padding: "2rem 0" }}>
          {filter === "all" ? "No tasks yet." : `No ${filter} tasks.`}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: "40px" }}></th>
                <th>Task</th>
                <th style={{ width: "80px" }}>Priority</th>
                <th style={{ width: "100px" }}>Due Date</th>
                <th style={{ width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onClick={() => handleSelectTask(task)}
                  selected={selectedTask?.id === task.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedTask && (
        <Modal title={selectedTask.title} onClose={() => setSelectedTask(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Task Info */}
            <div
              style={{
                padding: "1rem",
                background: "var(--color-surface-elevated)",
                borderRadius: "0.75rem",
                border: "1px solid var(--color-border)",
              }}
            >
              <p style={{ margin: "0 0 0.5rem", color: "var(--color-foreground)" }}>
                {selectedTask.description || "No description"}
              </p>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-foreground-muted)" }}>
                Due: {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : "Not set"} ·
                Priority: {selectedTask.priority} · Status: {selectedTask.status}
              </p>
            </div>

            {/* Subtasks */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, fontSize: "1rem" }}>Subtasks</h4>
                <span style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)" }}>
                  {subtasks.filter((s) => s.completed).length}/{subtasks.length} completed
                </span>
              </div>
              {subtasksLoading ? (
                <p style={{ color: "var(--color-foreground-muted)" }}>Loading subtasks…</p>
              ) : (
                <SubtaskList
                  subtasks={subtasks}
                  onToggle={handleToggleSubtask}
                  onDelete={handleDeleteSubtask}
                  onCreate={handleCreateSubtask}
                />
              )}
            </div>

            {/* Recurring Rule */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, fontSize: "1rem" }}>Recurring</h4>
                {selectedTask.recurring_rule?.is_active && (
                  <span style={{ fontSize: "0.875rem", color: "var(--color-success)" }}>Active</span>
                )}
              </div>
              {showRecurringForm ? (
                <RecurringRuleForm
                  onSubmit={handleCreateRecurring}
                  onCancel={() => setShowRecurringForm(false)}
                />
              ) : selectedTask.recurring_rule?.is_active ? (
                <p style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem" }}>
                  This task repeats {selectedTask.recurring_rule.frequency}
                </p>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowRecurringForm(true)}
                  style={{ width: "100%" }}
                >
                  Set up recurring
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
