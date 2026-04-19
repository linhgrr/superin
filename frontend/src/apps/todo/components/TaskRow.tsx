import { DynamicIcon } from "@/lib/icon-resolver";
import type { TaskRead } from "../api";
import { useTimezone } from "@/shared/hooks/useTimezone";
import RecurringBadge from "./RecurringBadge";
import type { RecurringFrequency } from "../api";

const PRIORITY_STYLE = {
  high: { color: "var(--color-danger)", bg: "oklch(0.63 0.24 25 / 0.15)" },
  medium: { color: "var(--color-warning)", bg: "oklch(0.75 0.18 85 / 0.15)" },
  low: { color: "var(--color-success)", bg: "oklch(0.72 0.19 145 / 0.15)" },
} as const satisfies Record<TaskRead["priority"], { bg: string; color: string }>;

interface TaskRowProps {
  task: TaskRead & {
    subtask_count?: number;
    subtask_completed?: number;
    recurring_rule?: {
      frequency: RecurringFrequency;
      is_active: boolean;
    } | null;
  };
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: () => void;
  selected?: boolean;
}

export default function TaskRow({ task, onToggle, onDelete, onClick, selected }: TaskRowProps) {
  const { formatWeekdayDate, isPast } = useTimezone();
  const priorityStyle = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.low;
  const overdue = Boolean(task.due_date) && isPast(task.due_date) && task.status === "pending";
  const hasSubtasks = (task.subtask_count ?? 0) > 0;
  const allSubtasksDone = hasSubtasks && task.subtask_completed === task.subtask_count;

  return (
    <tr
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        background: selected ? "var(--color-surface-elevated)" : undefined,
      }}
    >
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
            color: task.status === "completed" ? "var(--color-foreground-muted)" : "var(--color-foreground)",
            fontSize: "0.875rem",
          }}
        >
          {task.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
          {task.description && (
            <span style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
              {task.description}
            </span>
          )}
          {hasSubtasks && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.6875rem",
                color: allSubtasksDone ? "var(--color-success)" : "var(--color-foreground-muted)",
                fontWeight: 500,
              }}
            >
              <DynamicIcon name="ListTodo" size={10} />
              {task.subtask_completed ?? 0}/{task.subtask_count}
            </span>
          )}
          {task.recurring_rule?.is_active && (
            <RecurringBadge
              frequency={task.recurring_rule.frequency}
              isActive={task.recurring_rule.is_active}
            />
          )}
        </div>
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
      <td style={{ fontSize: "0.8125rem", color: overdue ? "var(--color-danger)" : "var(--color-foreground-muted)" }}>
        {task.due_date ? formatWeekdayDate(task.due_date) : "—"}
        {overdue && <DynamicIcon name="AlertTriangle" size={12} style={{ display: "inline", color: "var(--color-danger)", marginLeft: "0.25rem" }} />}
      </td>
      <td>
        <button
          className="btn btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          style={{ padding: "0.25rem 0.5rem", color: "var(--color-danger)" }}
          title="Delete task"
        >
          <DynamicIcon name="Trash2" size={14} />
        </button>
      </td>
    </tr>
  );
}
