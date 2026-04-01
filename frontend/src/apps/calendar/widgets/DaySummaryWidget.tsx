import { useState, useEffect } from "react";
import { listEvents, type Event } from "../api";
import { Sun, Sunrise } from "lucide-react";
import { useUserTimezone } from "@/hooks/useUserTimezone";

export default function DaySummaryWidget() {
  const [todayCount, setTodayCount] = useState(0);
  const [nextEvent, setNextEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { formatTime } = useUserTimezone();

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

      const tomorrowEnd = new Date(todayEnd);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

      // Fetch in parallel
      const [todayEvents, upcoming] = await Promise.all([
        listEvents(todayStart.toISOString(), todayEnd.toISOString(), undefined, 100),
        listEvents(now.toISOString(), tomorrowEnd.toISOString(), undefined, 1),
      ]);

      setTodayCount(todayEvents.length);
      setNextEvent(upcoming[0] || null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {isLoading ? (
        <div style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>Loading…</div>
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
              <Sun size={16} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--color-muted)", textTransform: "uppercase" }}>
                Today
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-foreground)" }}>
                {todayCount} events
              </div>
            </div>
          </div>

          {/* Next event */}
          {nextEvent ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
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
                <Sunrise size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.625rem", color: "var(--color-muted)", textTransform: "uppercase" }}>
                  Next · {formatTime(nextEvent.start_datetime)}
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
                  {nextEvent.title}
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
                  color: "var(--color-muted)",
                  flexShrink: 0,
                }}
              >
                <Sunrise size={16} />
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                No upcoming events
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
