import { useState, useEffect } from "react";
import { listEvents, type Event } from "../api";
import Widget from "./Widget";

interface UpcomingWidgetProps {
  maxItems?: number;
  calendarFilter?: string | null;
}

export function UpcomingWidget({ maxItems = 5, calendarFilter }: UpcomingWidgetProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, [calendarFilter]);

  async function loadEvents() {
    try {
      setIsLoading(true);
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

      let evts = await listEvents(now, end, calendarFilter || undefined, maxItems);
      setEvents(evts.slice(0, maxItems));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Widget title="Sự kiện sắp tới" isLoading={isLoading}>
      {events.length === 0 ? (
        <div style={{ padding: "1rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
          Không có sự kiện nào
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {events.map((event) => (
            <div
              key={event.id}
              style={{
                padding: "0.75rem",
                background: "var(--color-surface)",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{event.title}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
                {new Date(event.start_datetime).toLocaleString("vi-VN", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
}
