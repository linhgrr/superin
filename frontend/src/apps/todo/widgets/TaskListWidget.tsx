import type { DashboardWidgetRendererProps } from "../types";
import { getWidgetData, type TaskListWidgetData } from "../api";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useWidgetData } from "@/lib/widget-data";

const TASK_RENDER_LIMIT = 3;

export default function TaskListWidget({ widget }: DashboardWidgetRendererProps) {
  const { data, isLoading } = useWidgetData<TaskListWidgetData>(
    "todo",
    widget.id,
    () => getWidgetData(widget.id) as Promise<TaskListWidgetData>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.5rem" }}>
      {isLoading ? (
        <div className="stat-value" style={{ color: "var(--color-foreground-muted)" }}>—</div>
      ) : (data?.items?.length ?? 0) === 0 ? (
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem" }}>No tasks in this view</div>
      ) : (
        data.items.slice(0, TASK_RENDER_LIMIT).map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "999px",
                background: item.priority === "high"
                  ? "var(--color-danger-muted, oklch(0.63 0.24 25 / 0.15))"
                  : "var(--color-warning-muted, oklch(0.75 0.18 75 / 0.15))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: item.priority === "high" ? "var(--color-danger)" : "var(--color-warning)",
                flexShrink: 0,
              }}
            >
              <DynamicIcon name={item.status === "completed" ? "CheckCircle2" : "Circle"} size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.title}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-foreground-muted)" }}>
                {data.filter} view
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
