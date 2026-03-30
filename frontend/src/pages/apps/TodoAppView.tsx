/**
 * TodoAppView — /apps/todo — full todo task management.
 */

import { useEffect, useState } from "react";
import AppShell from "../AppShell";
import {
  getTasks,
  createTask,
  updateTask,
  toggleTask,
  deleteTask,
  type TaskRead,
} from "@/api/apps/todo";
import type {
  CreateTaskRequest,
  UpdateTaskRequest,
} from "@/types/generated/api";

const PRIORITY_STYLE: Record<string, { color: string; bg: string }> = {
  high: { color: "var(--color-danger)", bg: "oklch(0.63 0.24 25 / 0.15)" },
  medium: { color: "var(--color-warning)", bg: "oklch(0.75 0.18 85 / 0.15)" },
  low: { color: "var(--color-success)", bg: "oklch(0.72 0.19 145 / 0.15)" },
};

function TaskRow({ task, onToggle, onDelete }: {
  task: TaskRead;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const pStyle = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.low;
  const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status === "pending";

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={task.status === "completed"}
          onChange={() => onToggle(task.id)}
          style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
        />
      </td>
      <td>
        <span
          style={{
            textDecoration: task.status === "completed" ? "line-through" : "none",
            color: task.status === "completed" ? "var(--color-muted)" : "var(--color-foreground)",
            fontSize: "0.875rem",
          }}
        >
          {task.title}
        </span>
        {task.description && (
          <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", margin: "0.125rem 0 0" }}>
            {task.description}
          </p>
        )}
      </td>
      <td>
        <span
          style={{
            padding: "0.125rem 0.5rem",
            borderRadius: "999px",
            fontSize: "0.6875rem",
            fontWeight: 600,
            background: pStyle.bg,
            color: pStyle.color,
            textTransform: "capitalize",
          }}
        >
          {task.priority}
        </span>
      </td>
      <td style={{ fontSize: "0.8125rem", color: overdue ? "var(--color-danger)" : "var(--color-muted)" }}>
        {task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}
        {overdue && " ⚠"}
      </td>
      <td>
        <button
          className="btn btn-ghost"
          onClick={() => onDelete(task.id)}
          style={{ padding: "0.25rem 0.5rem", color: "var(--color-danger)" }}
          title="Delete task"
        >
          🗑
        </button>
      </td>
    </tr>
  );
}

function NewTaskForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: CreateTaskRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CreateTaskRequest>({
    title: "",
    priority: "medium",
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await onSubmit(form);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--color-surface-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "0.75rem",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        marginBottom: "1.25rem",
      }}
    >
      <input
        placeholder="What needs to be done?"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        autoFocus
        required
      />
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <select
          value={form.priority}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              priority: e.target.value as CreateTaskRequest["priority"],
            }))
          }
        >
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>
        <input
          type="date"
          value={form.due_date ? new Date(form.due_date).toISOString().slice(0, 10) : ""}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              due_date: e.target.value ? new Date(e.target.value) : null,
            }))
          }
        />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "…" : "Add Task"}
        </button>
      </div>
    </form>
  );
}

export default function TodoAppView() {
  const [tasks, setTasks] = useState<TaskRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  function load() {
    setLoading(true);
    getTasks()
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(id: string) {
    try {
      const updated = await toggleTask(id);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch { /* silent */ }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch { /* silent */ }
  }

  async function handleCreate(data: CreateTaskRequest) {
    const created = await createTask(data);
    setTasks((prev) => [created, ...prev]);
    setShowForm(false);
  }

  const filtered = tasks.filter((t) => {
    if (filter === "pending") return t.status === "pending";
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  const counts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  return (
    <AppShell title="Todo">
      {/* Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        {(["all", "pending", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background:
                filter === f ? "var(--color-primary)" : "var(--color-surface-elevated)",
              border: `1px solid ${filter === f ? "var(--color-primary)" : "var(--color-border)"}`,
              borderRadius: "0.75rem",
              padding: "0.75rem",
              cursor: "pointer",
              textAlign: "center",
              transition: "background 0.15s",
            }}
          >
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                fontFamily: "var(--font-heading)",
                color: filter === f ? "var(--color-primary-foreground)" : "var(--color-foreground)",
              }}
            >
              {counts[f]}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                textTransform: "capitalize",
                color: filter === f
                  ? "oklch(0.98 0 0 / 0.7)"
                  : "var(--color-muted)",
              }}
            >
              {f}
            </div>
          </button>
        ))}
      </div>

      {/* Add task */}
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

      {/* Task list */}
      {loading ? (
        <p style={{ color: "var(--color-muted)" }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--color-muted)", textAlign: "center", padding: "2rem 0" }}>
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
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
