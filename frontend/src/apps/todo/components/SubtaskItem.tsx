import { Check, Circle, Trash2 } from "lucide-react";
import type { SubTask } from "../api";

interface SubtaskItemProps {
  subtask: SubTask;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export default function SubtaskItem({
  subtask,
  onToggle,
  onDelete,
  disabled = false,
}: SubtaskItemProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem 0.75rem",
        borderRadius: "0.5rem",
        background: subtask.completed
          ? "oklch(0.22 0.01 265 / 0.5)"
          : "oklch(0.2 0.01 265 / 0.3)",
        transition: "background 0.15s",
      }}
    >
      <button
        onClick={() => onToggle(subtask.id, !subtask.completed)}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "20px",
          height: "20px",
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
        title={subtask.completed ? "Mark as incomplete" : "Mark as complete"}
      >
        {subtask.completed ? (
          <Check size={16} style={{ color: "var(--color-success)" }} />
        ) : (
          <Circle size={16} style={{ color: "var(--color-muted)" }} />
        )}
      </button>

      <span
        style={{
          flex: 1,
          fontSize: "0.875rem",
          textDecoration: subtask.completed ? "line-through" : "none",
          color: subtask.completed
            ? "var(--color-muted)"
            : "var(--color-foreground)",
          transition: "color 0.15s",
        }}
      >
        {subtask.title}
      </span>

      <button
        onClick={() => onDelete(subtask.id)}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "24px",
          height: "24px",
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          color: "var(--color-muted)",
          opacity: disabled ? 0.5 : 0,
          transition: "opacity 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--color-danger)";
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--color-muted)";
          e.currentTarget.style.opacity = "0";
        }}
        title="Delete subtask"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
