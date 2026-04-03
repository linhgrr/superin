import type { DashboardWidgetRendererProps } from "../types";
import { useTodoSummary } from "./useTodoSummary";
import { CalendarClock, AlertCircle } from "lucide-react";

export default function TodayWidget({ widget: _widget }: DashboardWidgetRendererProps) {
  const { summary, loading } = useTodoSummary();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {loading ? (
        <div className="stat-value" style={{ color: "var(--color-muted)" }}>—</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "var(--color-primary-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary)",
              flexShrink: 0,
            }}
          >
            <CalendarClock size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span className="stat-value" style={{ color: "var(--color-foreground)", fontSize: "1.75rem" }}>
                {summary?.due_today ?? 0}
              </span>
              {!loading && summary && summary.overdue > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.75rem",
                    color: "var(--color-danger)",
                  }}
                >
                  <AlertCircle size={12} />
                  {summary.overdue} overdue
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "0.125rem" }}>
              Tasks due today
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
