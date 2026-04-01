import { useState, useEffect } from "react";
import { listCalendars, listEvents, type Calendar, type Event } from "../api";

export default function CalendarScreen() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedCalendar, setSelectedCalendar] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setIsLoading(true);
      const [cals, evts] = await Promise.all([
        listCalendars(),
        listEvents(),
      ]);
      setCalendars(cals);
      setEvents(evts);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredEvents = selectedCalendar
    ? events.filter((e) => e.calendar_id === selectedCalendar)
    : events;

  // Group events by date
  const eventsByDate = filteredEvents.reduce((acc, event) => {
    const date = new Date(event.start_datetime).toLocaleDateString("vi-VN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  if (isLoading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
        Đang tải lịch...
      </div>
    );
  }

  return (
    <div>
      {/* Calendar filter tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--color-border)",
          marginBottom: "1.5rem",
          paddingBottom: "0.5rem",
        }}
      >
        <button
          onClick={() => setSelectedCalendar(null)}
          style={{
            padding: "0.5rem 1rem",
            border: "none",
            background: selectedCalendar === null ? "var(--color-surface-elevated)" : "transparent",
            color: selectedCalendar === null ? "var(--color-foreground)" : "var(--color-foreground-muted)",
            fontWeight: selectedCalendar === null ? 600 : 400,
            fontSize: "0.875rem",
            cursor: "pointer",
            borderRadius: "8px",
            transition: "all 0.15s",
          }}
        >
          Tất cả
        </button>
        {calendars.map((cal) => (
          <button
            key={cal.id}
            onClick={() => setSelectedCalendar(cal.id)}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: selectedCalendar === cal.id ? cal.color + "22" : "transparent",
              color: selectedCalendar === cal.id ? cal.color : "var(--color-foreground-muted)",
              fontWeight: selectedCalendar === cal.id ? 600 : 400,
              fontSize: "0.875rem",
              cursor: "pointer",
              borderRadius: "8px",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: cal.color,
              }}
            />
            {cal.name}
          </button>
        ))}
      </div>

      {/* Events list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {Object.entries(eventsByDate).length === 0 ? (
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "var(--color-foreground-muted)",
              background: "var(--color-surface)",
              borderRadius: "12px",
            }}
          >
            Không có sự kiện nào
          </div>
        ) : (
          Object.entries(eventsByDate).map(([date, dayEvents]) => (
            <div key={date}>
              <h3
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--color-foreground-muted)",
                  marginBottom: "0.75rem",
                  textTransform: "capitalize",
                }}
              >
                {date}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {dayEvents.map((event) => {
                  const calendar = calendars.find((c) => c.id === event.calendar_id);
                  return (
                    <div
                      key={event.id}
                      style={{
                        padding: "1rem",
                        background: "var(--color-surface-elevated)",
                        borderRadius: "12px",
                        borderLeft: `4px solid ${calendar?.color || "var(--color-primary)"}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                          {event.title}
                        </span>
                        {event.type === "time_blocked_task" && (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.125rem 0.5rem",
                              background: "var(--color-primary-muted)",
                              color: "var(--color-primary)",
                              borderRadius: "4px",
                            }}
                          >
                            Task
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--color-foreground-muted)",
                          display: "flex",
                          gap: "1rem",
                        }}
                      >
                        <span>
                          {new Date(event.start_datetime).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {" - "}
                          {new Date(event.end_datetime).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {event.location && <span>📍 {event.location}</span>}
                      </div>
                      {event.description && (
                        <div
                          style={{
                            fontSize: "0.8125rem",
                            color: "var(--color-foreground-subtle)",
                            marginTop: "0.25rem",
                          }}
                        >
                          {event.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
