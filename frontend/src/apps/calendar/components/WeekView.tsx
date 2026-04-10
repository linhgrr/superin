import { HOURS, HOUR_HEIGHT, DAY_NAMES, isSameDayInTimezone } from "../utils/dateHelpers";
import { calculateEventStyle } from "../utils/eventHelpers";
import type { CalendarRead, EventRead } from "../api";
import { useTimezone } from "@/shared/hooks/useTimezone";

interface WeekViewProps {
  weekDates: Date[];
  calendars: CalendarRead[];
  events: EventRead[];
  onCellClick: (date: Date, hour: number) => void;
}

export function WeekView({ weekDates, calendars, events, onCellClick }: WeekViewProps) {
  const { formatTime, timezone } = useTimezone();
  const today = new Date();

  const getEventsForDay = (date: Date) => {
    return events.filter((e) => isSameDayInTimezone(new Date(e.start_datetime), date, timezone));
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        background: "var(--color-surface)",
        borderRadius: "12px",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px repeat(7, 1fr)",
          borderBottom: "1px solid var(--color-border)",
          position: "sticky",
          top: 0,
          background: "var(--color-surface-elevated)",
          zIndex: 10,
        }}
      >
        <div /> {/* Empty corner */}
        {weekDates.map((date, i) => {
          const isToday = isSameDayInTimezone(date, today, timezone);
          return (
            <div
              key={i}
              style={{
                padding: "0.75rem 0.5rem",
                textAlign: "center",
                borderLeft: "1px solid var(--color-border)",
                background: isToday ? "var(--color-primary-muted)" : undefined,
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  color: isToday ? "var(--color-primary)" : "var(--color-foreground-muted)",
                  fontWeight: 600,
                }}
              >
                {DAY_NAMES[i]}
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: isToday ? "white" : "var(--color-foreground)",
                  marginTop: "0.25rem",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  background: isToday ? "var(--color-primary)" : "transparent",
                  margin: "0.25rem auto 0",
                }}
              >
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        {/* Time labels column */}
        <div>
          {HOURS.map((hour) => (
            <div
              key={hour}
              style={{
                height: `${HOUR_HEIGHT}px`,
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                paddingTop: "4px",
                fontSize: "0.75rem",
                color: "var(--color-foreground-muted)",
              }}
            >
              {hour}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDates.map((date, dayIndex) => {
          const dayEvents = getEventsForDay(date);
          const isToday = isSameDayInTimezone(date, today, timezone);

          return (
            <div
              key={dayIndex}
              style={{
                borderLeft: "1px solid var(--color-border)",
                position: "relative",
                background: isToday ? "var(--color-primary-muted)" : undefined,
              }}
            >
              {/* Hour cells */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  onClick={() => onCellClick(date, hour)}
                  style={{
                    height: `${HOUR_HEIGHT}px`,
                    borderBottom: "1px solid var(--color-border)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--color-surface-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                />
              ))}

              {/* Events overlay */}
              {dayEvents.map((event) => {
                const calendar = calendars.find((c) => c.id === event.calendar_id);
                const style = calculateEventStyle(event, HOUR_HEIGHT);

                return (
                  <div
                    key={event.id}
                    style={{
                      position: "absolute",
                      left: "2px",
                      right: "2px",
                      ...style,
                      background: calendar?.color || "var(--color-primary)",
                      borderRadius: "4px",
                      padding: "4px 6px",
                      fontSize: "0.75rem",
                      color: "white",
                      overflow: "hidden",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                      zIndex: 5,
                    }}
                    title={`${event.title}\n${formatTime(event.start_datetime)} - ${formatTime(event.end_datetime)}`}
                  >
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{event.title}</div>
                    <div style={{ fontSize: "0.625rem", opacity: 0.9 }}>
                      {formatTime(event.start_datetime, { hour: "2-digit", minute: "2-digit" })}
                      {event.location && ` 📍 ${event.location}`}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
