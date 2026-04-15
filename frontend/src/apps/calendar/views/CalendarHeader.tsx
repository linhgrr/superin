/**
 * CalendarHeader — navigation, calendar filter, and view toggle.
 */

import { useTimezone } from "@/shared/hooks/useTimezone";

import type { CalendarRead } from "../api";

const NAV_BUTTON_STYLE = {
  padding: "0.375rem 0.75rem",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.875rem",
} as const;

type ViewMode = "list" | "week";

interface CalendarHeaderProps {
  weekDates: Date[];
  calendars: CalendarRead[];
  selectedCalendar: string | null;
  viewMode: ViewMode;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSelectCalendar: (id: string | null) => void;
  onChangeView: (mode: ViewMode) => void;
  onCreateCalendar: () => void;
}

export function CalendarHeader({
  weekDates,
  calendars,
  selectedCalendar,
  viewMode,
  onPreviousWeek,
  onNextWeek,
  onToday,
  onSelectCalendar,
  onChangeView,
  onCreateCalendar,
}: CalendarHeaderProps) {
  const { formatDate } = useTimezone();

  const headerLabel = weekDates[0]
    ? formatDate(weekDates[0], { month: "long", year: "numeric" })
    : "";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface-elevated)",
        borderRadius: "12px",
        marginBottom: "1rem",
      }}
    >
      {/* Left: Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <button onClick={onPreviousWeek} style={NAV_BUTTON_STYLE}>←</button>
        <button onClick={onToday} style={{ ...NAV_BUTTON_STYLE, fontWeight: 500 }}>Today</button>
        <button onClick={onNextWeek} style={NAV_BUTTON_STYLE}>→</button>
        <span style={{ marginLeft: "1rem", fontWeight: 600, fontSize: "0.9375rem" }}>{headerLabel}</span>
      </div>

      {/* Center: Calendar filter */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <button
          onClick={() => onSelectCalendar(null)}
          style={{
            padding: "0.375rem 0.75rem",
            border: "none",
            background: selectedCalendar === null ? "var(--color-primary)" : "transparent",
            color: selectedCalendar === null ? "white" : "var(--color-foreground-muted)",
            fontWeight: selectedCalendar === null ? 600 : 400,
            fontSize: "0.75rem",
            cursor: "pointer",
            borderRadius: "6px",
            transition: "all 0.15s",
          }}
        >
          All
        </button>
        {calendars.map((cal) => (
          <button
            key={cal.id}
            onClick={() => onSelectCalendar(cal.id)}
            style={{
              padding: "0.375rem 0.75rem",
              border: "none",
              background: selectedCalendar === cal.id ? (cal.color || "var(--color-primary)") : "transparent",
              color: selectedCalendar === cal.id ? "white" : "var(--color-foreground-muted)",
              fontWeight: selectedCalendar === cal.id ? 600 : 400,
              fontSize: "0.75rem",
              cursor: "pointer",
              borderRadius: "6px",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            {cal.name}
          </button>
        ))}
      </div>

      {/* Right: View toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onCreateCalendar}
          style={{ whiteSpace: "nowrap" }}
        >
          New calendar
        </button>
        <div
          style={{
            display: "flex",
            background: "var(--color-surface)",
            borderRadius: "8px",
            padding: "0.25rem",
            border: "1px solid var(--color-border)",
          }}
        >
          <button
            onClick={() => onChangeView("week")}
            style={{
              padding: "0.375rem 0.75rem",
              border: "none",
              background: viewMode === "week" ? "var(--color-surface-elevated)" : "transparent",
              color: viewMode === "week" ? "var(--color-foreground)" : "var(--color-foreground-muted)",
              fontWeight: viewMode === "week" ? 600 : 400,
              fontSize: "0.75rem",
              cursor: "pointer",
              borderRadius: "6px",
              boxShadow: viewMode === "week" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Week
          </button>
          <button
            onClick={() => onChangeView("list")}
            style={{
              padding: "0.375rem 0.75rem",
              border: "none",
              background: viewMode === "list" ? "var(--color-surface-elevated)" : "transparent",
              color: viewMode === "list" ? "var(--color-foreground)" : "var(--color-foreground-muted)",
              fontWeight: viewMode === "list" ? 600 : 400,
              fontSize: "0.75rem",
              cursor: "pointer",
              borderRadius: "6px",
              boxShadow: viewMode === "list" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            List
          </button>
        </div>
      </div>
    </div>
  );
}
