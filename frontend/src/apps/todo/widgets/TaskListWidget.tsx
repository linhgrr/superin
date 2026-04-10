import type { DashboardWidgetRendererProps } from "../types";
import { useTodoSummary } from "./useTodoSummary";
import { DynamicIcon } from "@/lib/icon-resolver";

export default function TaskListWidget({ widget: _widget }: DashboardWidgetRendererProps) {
  const { data: summary, isLoading: loading } = useTodoSummary();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {loading ? (
        <div className="stat-value" style={{ color: "var(--color-foreground-muted)" }}>—</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Pending */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--color-warning-muted, oklch(0.75 0.18 75 / 0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-warning)",
                flexShrink: 0,
              }}
            >
              <DynamicIcon name="Circle" size={16} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--color-foreground-muted)", textTransform: "uppercase" }}>
                Pending
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-foreground)" }}>
                {summary?.pending ?? 0}
              </div>
            </div>
          </div>

          {/* Completed */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--color-success-muted, oklch(0.72 0.19 145 / 0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-success)",
                flexShrink: 0,
              }}
            >
              <DynamicIcon name="CheckCircle2" size={16} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--color-foreground-muted)", textTransform: "uppercase" }}>
                Done
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-success)" }}>
                {summary?.completed ?? 0}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
