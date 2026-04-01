import { useState } from "react";
import type { FormEvent } from "react";
import type { CreateTaskRequest } from "@/types/generated/api";

interface NewTaskFormProps {
  onSubmit: (data: CreateTaskRequest) => Promise<void>;
  onCancel: () => void;
}

export default function NewTaskForm({ onSubmit, onCancel }: NewTaskFormProps) {
  const [form, setForm] = useState<CreateTaskRequest>({
    title: "",
    priority: "medium",
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        autoFocus
        required
      />
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <select
          value={form.priority}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              priority: event.target.value as CreateTaskRequest["priority"],
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
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              due_date: event.target.value ? new Date(event.target.value) : null,
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
