import { AlertTriangle, Trash2 } from "lucide-react";
import type { TaskRead } from "../api";
import { useUserTimezone } from "@/hooks/useUserTimezone";

const PRIORITY_STYLE = {
  high: { color: "var(--color-danger)", bg: "oklch(0.63 0.24 25 / 0.15)" },
  medium: { color: "var(--color-warning)", bg: "oklch(0.75 0.18 85 / 0.15)" },
  low: { color: "var(--color-success)", bg: "oklch(0.72 0.19 145 / 0.15)" },
} as const;

interface TaskRowProps {
  task: TaskRead;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function TaskRow({ task, onToggle, onDelete }: TaskRowProps) {
  const { formatDate } = useUserTimezone();
  const priorityStyle = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.low;
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
            background: priorityStyle.bg,
            color: priorityStyle.color,
            textTransform: "capitalize",
          }}
        >
          {task.priority}
        </span>
      </td>
      <td style={{ fontSize: "0.8125rem", color: overdue ? "var(--color-danger)" : "var(--color-muted)" }}>
        {task.due_date ? formatDate(task.due_date, { month: "short", day: "numeric" }) : "—"}
        {overdue && <AlertTriangle size={12} style={{ display: "inline", color: "var(--color-danger)" }} />}
      </td>
      <td>
        <button
          className="btn btn-ghost"
          onClick={() => onDelete(task.id)}
          style={{ padding: "0.25rem 0.5rem", color: "var(--color-danger)" }}
          title="Delete task"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
