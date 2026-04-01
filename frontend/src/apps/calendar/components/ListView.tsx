import type { Calendar, Event } from "../api";
import { useUserTimezone } from "@/hooks/useUserTimezone";

interface ListViewProps {
  calendars: Calendar[];
  eventsByDate: Record<string, { label: string; events: Event[] }>;
}

export function ListView({ calendars, eventsByDate }: ListViewProps) {
  const { formatTime } = useUserTimezone();
  const sortedDateKeys = Object.keys(eventsByDate).sort();

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        background: "var(--color-surface)",
        borderRadius: "12px",
        border: "1px solid var(--color-border)",
        padding: "1rem",
      }}
    >
      {sortedDateKeys.length === 0 ? (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            color: "var(--color-foreground-muted)",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📅</div>
          <div>No events this week</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {sortedDateKeys.map((dateKey) => {
            const { label, events } = eventsByDate[dateKey];
            return (
              <div key={dateKey}>
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--color-foreground-muted)",
                    marginBottom: "0.75rem",
                    textTransform: "capitalize",
                    paddingBottom: "0.5rem",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {label}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {events.map((event) => {
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
                          transition: "transform 0.15s, box-shadow 0.15s",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateX(4px)";
                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateX(0)";
                          e.currentTarget.style.boxShadow = "none";
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
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>
                            {formatTime(event.start_datetime)}
                            {" - "}
                            {formatTime(event.end_datetime)}
                          </span>
                          {calendar && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                fontSize: "0.75rem",
                              }}
                            >
                              <span
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "50%",
                                  background: calendar.color,
                                }}
                              />
                              {calendar.name}
                            </span>
                          )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
