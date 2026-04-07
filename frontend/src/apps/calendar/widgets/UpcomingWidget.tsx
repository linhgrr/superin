import type { DashboardWidgetRendererProps } from "../types";
import { useCallback, useEffect, useState } from "react";
import { listEvents, type EventRead } from "../api";
import { Calendar } from "lucide-react";
import { useTimezone } from "@/shared/hooks/useTimezone";
import { getUserTimezone } from "@/shared/utils/timezone";

export default function UpcomingWidget({ widget: _widget }: DashboardWidgetRendererProps) {
  const maxItems = 3;
  const calendarFilter = null;
  const [events, setEvents] = useState<EventRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { timezone, formatDate, formatTime, isToday } = useTimezone();

  const loadEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const evts = await listEvents({
        start: now,
        end,
        calendar_id: calendarFilter || undefined,
        limit: maxItems,
      });
      setEvents(evts.slice(0, maxItems));
    } finally {
      setIsLoading(false);
    }
  }, [calendarFilter, maxItems]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const formatEventDate = (dateStr: string) => {
    // Use centralized isToday utility
    if (isToday(dateStr)) return "Today";

    // Check for tomorrow using timezone-aware comparison
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
            <Calendar size={20} />
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-foreground-muted)" }}>
            No upcoming events
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {events.map((event) => (
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
