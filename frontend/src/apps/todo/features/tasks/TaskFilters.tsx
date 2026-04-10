/**
 * TaskFilters — 3-button filter bar (All / Today / Upcoming).
 */

import { memo } from "react";
import type { TaskFilter } from "./TasksPanel";

const TASK_FILTER_VALUES = ["all", "pending", "completed"] as const satisfies readonly TaskFilter[];

interface TaskFiltersProps {
  filter: TaskFilter;
  counts: { all: number; pending: number; completed: number };
  onFilter: (f: TaskFilter) => void;
}

const TaskFilters = memo(function TaskFilters({ filter, counts, onFilter }: TaskFiltersProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "0.75rem",
        marginBottom: "1.5rem",
      }}
    >
      {TASK_FILTER_VALUES.map((value) => (
        <button
          key={value}
          onClick={() => onFilter(value)}
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
                : "var(--color-foreground-muted)",
            }}
          >
            {value}
          </div>
        </button>
      ))}
    </div>
  );
});

export default TaskFilters;
