import type { CalendarRead, EventRead } from "../api";
import { useTimezone } from "@/shared/hooks/useTimezone";
import { getColorStyleForEvent } from "../utils/eventHelpers";
import "./ListView.css";

interface ListViewProps {
  calendars: CalendarRead[];
  eventsByDate: Record<string, { label: string; events: EventRead[] }>;
  onEventClick: (event: EventRead) => void;
}

export function ListView({ calendars, eventsByDate, onEventClick }: ListViewProps) {
  const { formatTime } = useTimezone();
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
                        className="event-card"
                        style={{
                          padding: "1rem",
                          background: "var(--color-surface-elevated)",
                          borderRadius: "12px",
                          borderLeft: "4px solid var(--event-bg, hsl(var(--event-hue), 70%, 50%))",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.25rem",
                          cursor: "pointer",
                          ...getColorStyleForEvent(event.id),
                        } as React.CSSProperties}
                        onClick={() => onEventClick(event)}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <span className="event-card__title">
                            {event.title}
                          </span>
                          {event.type === "time_blocked_task" && (
                            <span className="event-card__badge">
                              Task
                            </span>
                          )}
                        </div>
                        <div className="event-card__meta">
                          <span className="event-card__meta-label">
                            {event.is_all_day ? (
                              "All day"
                            ) : (
                              <>
                                {formatTime(event.start_datetime)}
                                {" - "}
                                {formatTime(event.end_datetime)}
                              </>
                            )}
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
                          <div className="event-card__description">
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
