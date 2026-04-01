import type { DashboardWidgetRendererProps } from "../types";
import { useTodoSummary } from "./useTodoSummary";

export default function TodayWidget({ widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useTodoSummary();

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
