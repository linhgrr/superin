import { useState, useEffect, useMemo, useCallback } from "react";
import {
  listCalendars,
  listEvents,
  createEvent,
  type Calendar,
  type Event,
  type CreateEventRequest,
} from "../api";
import { WeekView } from "../components/WeekView";
import { ListView } from "../components/ListView";
import { CreateEventModal } from "../components/CreateEventModal";
import { getWeekDatesInTimezone } from "../utils/dateHelpers";
import { filterEventsByCalendar, groupEventsByDate } from "../utils/eventHelpers";
import { useUserTimezone } from "@/hooks/useUserTimezone";

type ViewMode = "list" | "week";

export default function CalendarScreen() {
  const { timezone } = useUserTimezone();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCalendar, setSelectedCalendar] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);

  // Derived state
  const weekDates = useMemo(() => getWeekDatesInTimezone(currentDate, timezone), [currentDate, timezone]);
  const filteredEvents = useMemo(
    () => filterEventsByCalendar({ events, selectedCalendar }),
    [events, selectedCalendar]
  );
  const eventsByDate = useMemo(() => groupEventsByDate(filteredEvents, { timezone }), [filteredEvents, timezone]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const start = weekDates[0].toISOString();
      const end = weekDates[6].toISOString();

      const [cals, evts] = await Promise.all([
        listCalendars(),
        listEvents(start, end, selectedCalendar || undefined, 200),
      ]);
      setCalendars(cals);
      setEvents(evts);
    } finally {
      setIsLoading(false);
    }
  }, [weekDates, selectedCalendar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Navigation handlers
  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => setCurrentDate(new Date());

  // Event creation
  const handleCellClick = (date: Date) => {
    setNewEventDate(date);
    setShowCreateModal(true);
  };

  const handleCreateEvent = async (title: string, startMinutes: number, endMinutes: number) => {
    if (!newEventDate || calendars.length === 0) return;

    const defaultCalendar = calendars.find((c) => c.is_default) || calendars[0];
    const start = new Date(newEventDate);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const end = new Date(start);
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

    try {
      const request: CreateEventRequest = {
        title,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        calendar_id: defaultCalendar.id,
      };
      await createEvent(request);
      await loadData();
      setShowCreateModal(false);
    } catch (err) {
      console.error("Failed to create event:", err);
      alert("Failed to create event");
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "var(--color-foreground-muted)",
        }}
      >
        Loading calendar...
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Header
        weekDates={weekDates}
        calendars={calendars}
        selectedCalendar={selectedCalendar}
        viewMode={viewMode}
        onPreviousWeek={goToPreviousWeek}
        onNextWeek={goToNextWeek}
        onToday={goToToday}
        onSelectCalendar={setSelectedCalendar}
        onChangeView={setViewMode}
      />

      {/* Content */}
      {viewMode === "week" ? (
        <WeekView
          weekDates={weekDates}
          calendars={calendars}
          events={filteredEvents}
          onCellClick={handleCellClick}
        />
      ) : (
        <ListView calendars={calendars} eventsByDate={eventsByDate} />
      )}

      {/* Create Event Modal */}
      {showCreateModal && newEventDate && (
        <CreateEventModal
          date={newEventDate}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateEvent}
        />
      )}
    </div>
  );
}

// Header Component
interface HeaderProps {
  weekDates: Date[];
  calendars: Calendar[];
  selectedCalendar: string | null;
  viewMode: ViewMode;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSelectCalendar: (id: string | null) => void;
  onChangeView: (mode: ViewMode) => void;
}

function Header({
  weekDates,
  calendars,
  selectedCalendar,
  viewMode,
  onPreviousWeek,
  onNextWeek,
  onToday,
  onSelectCalendar,
  onChangeView,
}: HeaderProps) {
  const { formatDate } = useUserTimezone();

  // Get month/year from first date, format with timezone
  const firstDate = weekDates[0];
  const headerLabel = firstDate
    ? formatDate(firstDate, { month: "long", year: "numeric" })
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
        <button onClick={onPreviousWeek} style={navButtonStyle}>←</button>
        <button onClick={onToday} style={{ ...navButtonStyle, fontWeight: 500 }}>Today</button>
        <button onClick={onNextWeek} style={navButtonStyle}>→</button>
        <span style={{ marginLeft: "1rem", fontWeight: 600, fontSize: "0.9375rem" }}>
          {headerLabel}
        </span>
      </div>

      {/* Center: Calendar filter */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <CalendarFilterButton
          active={selectedCalendar === null}
          onClick={() => onSelectCalendar(null)}
        >
          All
        </CalendarFilterButton>
        {calendars.map((cal) => (
          <CalendarFilterButton
            key={cal.id}
            active={selectedCalendar === cal.id}
            color={cal.color}
            onClick={() => onSelectCalendar(cal.id)}
          >
            {cal.name}
          </CalendarFilterButton>
        ))}
      </div>

      {/* Right: View toggle */}
      <ViewToggle viewMode={viewMode} onChange={onChangeView} />
    </div>
  );
}

// Calendar Filter Button
interface CalendarFilterButtonProps {
  children: React.ReactNode;
  active: boolean;
  color?: string;
  onClick: () => void;
}

function CalendarFilterButton({ children, active, color, onClick }: CalendarFilterButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.375rem 0.75rem",
        border: "none",
        background: active ? (color || "var(--color-primary)") : "transparent",
        color: active ? "white" : "var(--color-foreground-muted)",
        fontWeight: active ? 600 : 400,
        fontSize: "0.75rem",
        cursor: "pointer",
        borderRadius: "6px",
        transition: "all 0.15s",
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
      }}
    >
      {children}
    </button>
  );
}

// View Toggle
interface ViewToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

function ViewToggle({ viewMode, onChange }: ViewToggleProps) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--color-surface)",
        borderRadius: "8px",
        padding: "0.25rem",
        border: "1px solid var(--color-border)",
      }}
    >
      <ViewButton active={viewMode === "week"} onClick={() => onChange("week")}>Week</ViewButton>
      <ViewButton active={viewMode === "list"} onClick={() => onChange("list")}>List</ViewButton>
    </div>
  );
}

interface ViewButtonProps {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

function ViewButton({ children, active, onClick }: ViewButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.375rem 0.75rem",
        border: "none",
        background: active ? "var(--color-surface-elevated)" : "transparent",
        color: active ? "var(--color-foreground)" : "var(--color-foreground-muted)",
        fontWeight: active ? 600 : 400,
        fontSize: "0.75rem",
        cursor: "pointer",
        borderRadius: "6px",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
      }}
    >
      {children}
    </button>
  );
}

// Styles
const navButtonStyle = {
  padding: "0.375rem 0.75rem",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.875rem",
} as const;
