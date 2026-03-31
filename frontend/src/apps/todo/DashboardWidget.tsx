/**
 * TodoWidget — renders a todo widget on the dashboard.
 */

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { getTodoSummary } from "./api";
import type { AppCatalogEntry } from "@/types/generated/api";

interface Props {
  widgetId: string;
  widget: AppCatalogEntry["widgets"][number];
}

export default function TodoWidget({ widgetId, widget }: Props) {
  const [summary, setSummary] = useState<{
    total: number;
    pending: number;
    completed: number;
    overdue: number;
    due_today: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTodoSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (
    widgetId === "todo.task-list" ||
    widgetId === "todo.task-count" ||
    widgetId === "todo.summary"
  ) {
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

  if (widgetId === "todo.today") {
    return (
      <div>
        <p className="section-label">{widget.name}</p>
        {loading ? (
          <div className="stat-value" style={{ color: "var(--color-muted)" }}>—</div>
        ) : (
          <div className="stat-value" style={{ color: "var(--color-foreground)" }}>
            {summary?.due_today ?? 0}
          </div>
        )}

        {!loading && summary && (
          <div
            style={{
              marginTop: "0.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
              fontSize: "0.75rem",
              color: "var(--color-muted)",
            }}
          >
            <span>Due today</span>
            <span style={{ color: "var(--color-danger)" }}>
              Overdue: {summary.overdue}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Fallback
  return (
    <div>
      <p className="section-label">{widget.name}</p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", margin: "0.25rem 0 0" }}>
        {widget.description}
      </p>
    </div>
  );
}
