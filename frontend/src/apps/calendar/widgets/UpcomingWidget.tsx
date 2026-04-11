import type { DashboardWidgetRendererProps } from "../types";
import { getWidgetData, type UpcomingWidgetData, type EventRead } from "../api";
import { DynamicIcon } from "@/lib/icon-resolver";
import { useWidgetData } from "@/lib/widget-data";
import { useTimezone } from "@/shared/hooks/useTimezone";
import { getUserTimezone } from "@/shared/utils/timezone";

export default function UpcomingWidget({ widget }: DashboardWidgetRendererProps) {
  const { data, isLoading } = useWidgetData<UpcomingWidgetData>(
    "calendar",
    widget.id,
    () => getWidgetData(widget.id) as Promise<UpcomingWidgetData>
  );
  const { timezone, formatDate, formatTime, isToday } = useTimezone();

  const events = data?.items ?? [];

  const formatEventDate = (dateStr: string) => {
    if (isToday(dateStr)) return "Today";

    const date = new Date(dateStr);
    const tz = timezone || getUserTimezone();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateInTz = new Date(date.toLocaleString("en-US", { timeZone: tz }));
    const tomorrowInTz = new Date(tomorrow.toLocaleString("en-US", { timeZone: tz }));

    if (dateInTz.toDateString() === tomorrowInTz.toDateString()) return "Tomorrow";

    return formatDate(dateStr, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {isLoading ? (
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem" }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "var(--color-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-foreground-muted)",
              flexShrink: 0,
            }}
          >
            <DynamicIcon name="Calendar" size={20} />
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)" }}>
            No upcoming events
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {events.map((event: EventRead) => (
            <div
              key={event.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.5rem",
                background: "var(--color-surface)",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: event.color || "var(--color-primary)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "0.8125rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {event.title}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--color-foreground-muted)" }}>
                  {formatEventDate(event.start_datetime)} · {formatTime(event.start_datetime)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
