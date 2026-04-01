import { useState, useEffect } from "react";
import { listEvents, type Event } from "../api";
import { Calendar } from "lucide-react";
import { useUserTimezone } from "@/hooks/useUserTimezone";

interface UpcomingWidgetProps {
  maxItems?: number;
  calendarFilter?: string | null;
}

export default function UpcomingWidget({ maxItems = 3, calendarFilter }: UpcomingWidgetProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { timezone, formatDate, formatTime } = useUserTimezone();

  useEffect(() => {
    loadEvents();
  }, [calendarFilter]);

  async function loadEvents() {
    try {
      setIsLoading(true);
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const evts = await listEvents(now, end, calendarFilter || undefined, maxItems);
      setEvents(evts.slice(0, maxItems));
    } finally {
      setIsLoading(false);
    }
  }

  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Format using user's timezone
    const dateInTz = timezone
      ? new Date(date.toLocaleString("en-US", { timeZone: timezone }))
      : date;
    const todayInTz = timezone
      ? new Date(today.toLocaleString("en-US", { timeZone: timezone }))
      : today;
    const tomorrowInTz = new Date(todayInTz);
    tomorrowInTz.setDate(tomorrowInTz.getDate() + 1);

    if (dateInTz.toDateString() === todayInTz.toDateString()) return "Today";
    if (dateInTz.toDateString() === tomorrowInTz.toDateString()) return "Tomorrow";

    return formatDate(dateStr, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {isLoading ? (
        <div style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>Loading…</div>
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
              color: "var(--color-muted)",
              flexShrink: 0,
            }}
          >
            <Calendar size={20} />
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
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
                <div style={{ fontSize: "0.6875rem", color: "var(--color-muted)" }}>
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
