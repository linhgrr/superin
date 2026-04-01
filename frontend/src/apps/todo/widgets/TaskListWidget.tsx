import type { DashboardWidgetRendererProps } from "../types";
import { Check } from "lucide-react";
import { useTodoSummary } from "./useTodoSummary";

export default function TaskListWidget({ widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useTodoSummary();

  return (
    <div>
      <p className="section-label">{widget.name}</p>
      {loading ? (
        <div className="stat-value" style={{ color: "var(--color-muted)" }}>—</div>
      ) : (
        <div className="stat-value" style={{ color: "var(--color-foreground)" }}>
          {summary?.pending ?? 0}
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 400,
              color: "var(--color-muted)",
              marginLeft: "0.25rem",
            }}
          >
            pending
          </span>
        </div>
      )}
      {!loading && summary && (
        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            gap: "1rem",
            fontSize: "0.75rem",
            color: "var(--color-muted)",
          }}
        >
          <span style={{ color: "var(--color-success)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <Check size={12} />
            {summary.completed}
          </span>
          {summary.due_today > 0 && (
            <span style={{ color: "var(--color-warning)" }}>
              Due today: {summary.due_today}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
