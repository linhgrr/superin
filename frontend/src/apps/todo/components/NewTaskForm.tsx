import { useState } from "react";
import type { FormEvent } from "react";

import { useAsyncTask } from "@/hooks/useAsyncTask";
import { dateInputValueToUtcIso, toDateInputValue } from "@/shared/utils/datetime";

import type { CreateTaskRequest } from "../api";

interface NewTaskFormProps {
  onSubmit: (data: CreateTaskRequest) => Promise<void>;
  onCancel: () => void;
}

export default function NewTaskForm({ onSubmit, onCancel }: NewTaskFormProps) {
  const [form, setForm] = useState<CreateTaskRequest>({
    title: "",
    priority: "medium",
  });
  const [dueDateInput, setDueDateInput] = useState("");
  const { isPending: loading, run } = useAsyncTask();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const dueDate = dueDateInput ? dateInputValueToUtcIso(dueDateInput) : null;
    if (dueDateInput && !dueDate) {
      return;
    }
    try {
      await run(() =>
        onSubmit({
          ...form,
          title: form.title.trim(),
          due_date: dueDate,
        })
      );
    } catch {
      // The parent form handles user-visible errors.
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
          value={dueDateInput || toDateInputValue(form.due_date)}
          onChange={(event) => setDueDateInput(event.target.value)}
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
