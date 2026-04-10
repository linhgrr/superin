import type { DashboardWidgetRendererProps } from "../types";
import { useTodoSummary } from "./useTodoSummary";
import { DynamicIcon } from "@/lib/icon-resolver";

export default function TodayWidget({ widget: _widget }: DashboardWidgetRendererProps) {
  const { data: summary, isLoading } = useTodoSummary();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {isLoading ? (
        <div className="stat-value" style={{ color: "var(--color-foreground-muted)" }}>—</div>
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
            <DynamicIcon name="CalendarClock" size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span className="stat-value" style={{ color: "var(--color-foreground)", fontSize: "1.75rem" }}>
                {summary?.due_today ?? 0}
              </span>
              {!isLoading && summary && summary.overdue > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.75rem",
                    color: "var(--color-danger)",
                  }}
                >
                  <DynamicIcon name="AlertCircle" size={12} />
                  {summary.overdue} overdue
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginTop: "0.125rem" }}>
              Tasks due today
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
