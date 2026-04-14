import type { DashboardWidgetRendererProps } from "../types";
import { getWidgetData, type DaySummaryWidgetData } from "../api";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useWidgetData } from "@/lib/widget-data";
import { useTimezone } from "@/shared/hooks/useTimezone";

export default function DaySummaryWidget({ widget }: DashboardWidgetRendererProps) {
  const { data, isLoading } = useWidgetData<DaySummaryWidgetData>(
    "calendar",
    widget.id,
    () => getWidgetData(widget.id) as Promise<DaySummaryWidgetData>
  );
  const { formatTime } = useTimezone();

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {isLoading ? (
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", gap: "1rem" }}>
          {/* Today count */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--color-primary-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-primary)",
                flexShrink: 0,
              }}
            >
              <DynamicIcon name="Sun" size={16} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--color-foreground-muted)", textTransform: "uppercase" }}>
                Today
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-foreground)" }}>
                {data?.today_count ?? 0} events
              </div>
            </div>
          </div>

          {/* Next event */}
          {data?.next_event ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "var(--color-success-muted-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-success)",
                  flexShrink: 0,
                }}
              >
                <DynamicIcon name="Sunrise" size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.625rem", color: "var(--color-foreground-muted)", textTransform: "uppercase" }}>
                  Next · {formatTime(data.next_event.start_datetime)}
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--color-foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {data.next_event.title}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "var(--color-surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-foreground-muted)",
                  flexShrink: 0,
                }}
              >
                <DynamicIcon name="Sunrise" size={16} />
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
                No upcoming events
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
