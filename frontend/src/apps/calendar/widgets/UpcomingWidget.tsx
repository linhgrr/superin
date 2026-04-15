import type { DashboardWidgetRendererProps } from "../types";
import WidgetState from "@/components/feedback/WidgetState";
import { getWidgetData, type UpcomingWidgetData, type EventRead } from "../api";
import { useWidgetData } from "@/lib/widget-data";
import { useTimezone } from "@/shared/hooks/useTimezone";
import { utcToLocalDate } from "@/shared/utils/datetime";

export default function UpcomingWidget({ widget }: DashboardWidgetRendererProps) {
  const { data, error, isLoading, mutate } = useWidgetData<UpcomingWidgetData>(
    "calendar",
    widget.id,
    () => getWidgetData(widget.id) as Promise<UpcomingWidgetData>
  );
  const { formatDate, formatTime, isToday, getNow } = useTimezone();

  const events = data?.items ?? [];

  if (isLoading) {
    return (
      <WidgetState
        variant="loading"
        title="Loading upcoming events"
        description="Fetching the next items on your calendar."
      />
    );
  }

  if (error) {
    return (
      <WidgetState
        variant="error"
        title="Could not load upcoming events"
        description={error instanceof Error ? error.message : "Please try again."}
        onRetry={() => {
          void mutate();
        }}
      />
    );
  }

  const formatEventDate = (dateStr: string) => {
    if (isToday(dateStr)) return "Today";

    // Compute "tomorrow" in the user's timezone (not browser system time)
    const [todayDateStr] = getNow();
    const [y, m, d] = todayDateStr.split("-").map(Number);
    const tomorrowDate = new Date(y, m - 1, d + 1); // user-tz midnight
    const tomorrowInTz = utcToLocalDate(tomorrowDate.toISOString());

    const dateInTz = utcToLocalDate(dateStr);
    if (dateInTz && tomorrowInTz && dateInTz.toDateString() === tomorrowInTz.toDateString()) {
      return "Tomorrow";
    }

    return formatDate(dateStr, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {events.length === 0 ? (
        <WidgetState
          variant="empty"
          title="No upcoming events"
          description="Upcoming calendar items will show up here when they are scheduled."
        />
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
