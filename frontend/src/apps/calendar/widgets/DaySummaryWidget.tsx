import { useState, useEffect } from "react";
import { listEvents, type Event } from "../api";
import Widget from "./Widget";

export function DaySummaryWidget() {
  const [todayEvents, setTodayEvents] = useState<Event[]>([]);
  const [tomorrowEvents, setTomorrowEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      setIsLoading(true);

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const tomorrowEnd = new Date(todayEnd);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

      const [today, tomorrow] = await Promise.all([
        listEvents(todayStart.toISOString(), todayEnd.toISOString()),
        listEvents(tomorrowStart.toISOString(), tomorrowEnd.toISOString()),
      ]);

      setTodayEvents(today);
      setTomorrowEvents(tomorrow);
    } finally {
      setIsLoading(false);
    }
  }

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Widget isLoading={isLoading}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Today */}
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--color-primary)",
              marginBottom: "0.5rem",
            }}
          >
            Today ({todayEvents.length} events)
          </div>
          {todayEvents.length === 0 ? (
            <div style={{ fontSize: "0.8125rem", color: "var(--color-foreground-muted)" }}>
              No events
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              {todayEvents.slice(0, 3).map((e) => (
                <div
                  key={e.id}
                  style={{
                    fontSize: "0.8125rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  <span style={{ color: "var(--color-foreground-muted)", minWidth: "45px" }}>
                    {formatTime(e.start_datetime)}
                  </span>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.title}
                  </span>
                </div>
              ))}
              {todayEvents.length > 3 && (
                <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", marginTop: "0.25rem" }}>
                  +{todayEvents.length - 3} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tomorrow */}
        <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--color-border)" }}>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "var(--color-foreground-muted)",
              marginBottom: "0.5rem",
            }}
          >
            Tomorrow ({tomorrowEvents.length} events)
          </div>
          {tomorrowEvents.length === 0 ? (
            <div style={{ fontSize: "0.8125rem", color: "var(--color-foreground-muted)" }}>
              No events
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              {tomorrowEvents.slice(0, 2).map((e) => (
                <div
                  key={e.id}
                  style={{
                    fontSize: "0.8125rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  <span style={{ color: "var(--color-foreground-muted)", minWidth: "45px" }}>
                    {formatTime(e.start_datetime)}
                  </span>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}
