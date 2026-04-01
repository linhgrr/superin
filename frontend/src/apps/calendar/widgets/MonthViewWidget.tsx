import { useState, useEffect } from "react";
import { listEvents, listCalendars, type Event, type Calendar } from "../api";
import Widget from "./Widget";

interface MonthViewWidgetProps {
  defaultCalendar?: string | null;
  showTimeBlockedTasks?: boolean;
}

export function MonthViewWidget({ defaultCalendar, showTimeBlockedTasks = true }: MonthViewWidgetProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [currentDate, defaultCalendar, showTimeBlockedTasks]);

  async function loadData() {
    try {
      setIsLoading(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0).toISOString();

      const [evts, cals] = await Promise.all([
        listEvents(start, end, defaultCalendar || undefined, 100),
        listCalendars(),
      ]);

      const filtered = showTimeBlockedTasks ? evts : evts.filter((e) => e.type !== "time_blocked_task");

      setEvents(filtered);
      setCalendars(cals);
    } finally {
      setIsLoading(false);
    }
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get first day of month and total days
  const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Adjust for Monday start (0 = Monday)
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const monthNames = [
    "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
    "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
    "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
  ];

  const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

  // Group events by date
  const eventsByDay = events.reduce((acc, event) => {
    const day = new Date(event.start_datetime).getDate();
    if (!acc[day]) acc[day] = [];
    acc[day].push(event);
    return acc;
  }, {} as Record<number, Event[]>);

  const today = new Date().getDate();
  const isCurrentMonth = new Date().getMonth() === month && new Date().getFullYear() === year;

  return (
    <Widget isLoading={isLoading}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            style={{
              padding: "0.375rem 0.75rem",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            ←
          </button>
          <div style={{ fontWeight: 600, fontSize: "1rem" }}>
            {monthNames[month]} {year}
          </div>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            style={{
              padding: "0.375rem 0.75rem",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            →
          </button>
        </div>

        {/* Day headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "4px",
            marginBottom: "0.5rem",
          }}
        >
          {dayNames.map((day) => (
            <div
              key={day}
              style={{
                textAlign: "center",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--color-foreground-muted)",
                padding: "0.25rem",
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "4px",
            flex: 1,
          }}
        >
          {/* Empty cells before first day */}
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} style={{ aspectRatio: "1" }} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = eventsByDay[day] || [];
            const isToday = isCurrentMonth && day === today;

            return (
              <div
                key={day}
                style={{
                  aspectRatio: "1",
                  padding: "0.25rem",
                  background: isToday ? "var(--color-primary-muted)" : "var(--color-surface)",
                  borderRadius: "6px",
                  border: isToday ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: isToday ? 600 : 400,
                    color: isToday ? "var(--color-primary)" : "var(--color-foreground)",
                    textAlign: "right",
                  }}
                >
                  {day}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1px", flex: 1 }}>
                  {dayEvents.slice(0, 3).map((event) => {
                    const calendar = calendars.find((c) => c.id === event.calendar_id);
                    return (
                      <div
                        key={event.id}
                        style={{
                          height: "4px",
                          background: calendar?.color || "var(--color-primary)",
                          borderRadius: "2px",
                        }}
                        title={event.title}
                      />
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div
                      style={{
                        fontSize: "0.625rem",
                        color: "var(--color-foreground-muted)",
                        textAlign: "center",
                      }}
                    >
                      +{dayEvents.length - 3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Widget>
  );
}
