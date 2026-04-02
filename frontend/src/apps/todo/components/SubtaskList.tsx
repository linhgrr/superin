import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import type { SubTask } from "../api";
import SubtaskItem from "./SubtaskItem";

interface SubtaskListProps {
  subtasks: SubTask[];
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onCreate: (title: string) => Promise<void>;
  disabled?: boolean;
}

export default function SubtaskList({
  subtasks,
  onToggle,
  onDelete,
  onCreate,
  disabled = false,
}: SubtaskListProps) {
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const completedCount = subtasks.filter((s) => s.completed).length;
  const progress = subtasks.length > 0
    ? Math.round((completedCount / subtasks.length) * 100)
    : 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;

    setIsAdding(true);
    try {
      await onCreate(newTitle.trim());
      setNewTitle("");
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {/* Progress bar */}
      {subtasks.length > 0 && (
        <div style={{ marginBottom: "0.25rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: "var(--color-muted)",
              marginBottom: "0.25rem",
            }}
          >
            <span>
              {completedCount} of {subtasks.length} completed
            </span>
            <span>{progress}%</span>
          </div>
          <div
            style={{
              height: "4px",
              background: "var(--color-border)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: progress === 100
                  ? "var(--color-success)"
                  : "var(--color-primary)",
                borderRadius: "2px",
                transition: "width 0.3s, background 0.3s",
              }}
            />
          </div>
        </div>
      )}

      {/* Subtask list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        {subtasks.map((subtask) => (
          <SubtaskItem
            key={subtask.id}
            subtask={subtask}
            onToggle={onToggle}
            onDelete={onDelete}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Add new subtask */}
      {showInput ? (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Enter subtask title..."
            autoFocus
            disabled={isAdding}
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              fontSize: "0.875rem",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.5rem",
              color: "var(--color-foreground)",
            }}
          />
          <button
            type="submit"
            disabled={isAdding || !newTitle.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.5rem 0.75rem",
              background: "var(--color-primary)",
              border: "none",
              borderRadius: "0.5rem",
              color: "var(--color-primary-foreground)",
              cursor: isAdding || !newTitle.trim() ? "not-allowed" : "pointer",
              opacity: isAdding || !newTitle.trim() ? 0.6 : 1,
            }}
          >
            {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInput(false);
              setNewTitle("");
            }}
            disabled={isAdding}
            style={{
              padding: "0.5rem 0.75rem",
              background: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.5rem",
              color: "var(--color-muted)",
              cursor: isAdding ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: "transparent",
            border: "1px dashed var(--color-border)",
            borderRadius: "0.5rem",
            color: "var(--color-muted)",
            fontSize: "0.875rem",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-primary)";
            e.currentTarget.style.color = "var(--color-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.color = "var(--color-muted)";
          }}
        >
          <Plus size={14} />
          Add subtask
        </button>
      )}
    </div>
  );
}
