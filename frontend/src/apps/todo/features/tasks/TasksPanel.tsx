import { useEffect, useState } from "react";
import type { CreateTaskRequest } from "@/types/generated/api";
import { createTask, deleteTask, getTasks, toggleTask, type TaskRead } from "../../api";
import NewTaskForm from "../../components/NewTaskForm";
import TaskRow from "../../components/TaskRow";

export default function TasksPanel() {
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

  useEffect(() => {
    load();
  }, []);

  async function handleToggle(id: string) {
    try {
      const updated = await toggleTask(id);
      setTasks((current) => current.map((task) => (task.id === id ? updated : task)));
    } catch {}
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id);
      setTasks((current) => current.filter((task) => task.id !== id));
    } catch {}
  }

  async function handleCreate(data: CreateTaskRequest) {
    const created = await createTask(data);
    setTasks((current) => [created, ...current]);
    setShowForm(false);
  }

  const filtered = tasks.filter((task) => {
    if (filter === "pending") return task.status === "pending";
    if (filter === "completed") return task.status === "completed";
    return true;
  });

  const counts = {
    all: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  };

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        {(["all", "pending", "completed"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            style={{
              background:
                filter === value ? "var(--color-primary)" : "var(--color-surface-elevated)",
              border: `1px solid ${filter === value ? "var(--color-primary)" : "var(--color-border)"}`,
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
                color: filter === value ? "var(--color-primary-foreground)" : "var(--color-foreground)",
              }}
            >
              {counts[value]}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                textTransform: "capitalize",
                color: filter === value
                  ? "oklch(0.98 0 0 / 0.7)"
                  : "var(--color-muted)",
              }}
            >
              {value}
            </div>
          </button>
        ))}
      </div>

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
    </>
  );
}
