/**
 * CalendarScreen — calendar with week/list view and event management.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  listCalendars,
  listEvents,
  createEvent,
  type CalendarRead,
  type CreateEventRequest,
  type EventRead,
} from "../api";
import { WeekView } from "../components/WeekView";
import { ListView } from "../components/ListView";
import { CreateEventModal } from "../components/CreateEventModal";
import { getWeekDatesInTimezone } from "../utils/dateHelpers";
import { filterEventsByCalendar, groupEventsByDate } from "../utils/eventHelpers";
import { useTimezone } from "@/shared/hooks/useTimezone";
import { CalendarHeader } from "./CalendarHeader";

type ViewMode = "list" | "week";
const CALENDAR_EVENT_TYPE: CreateEventRequest["type"] = "event";

export default function CalendarScreen() {
  const { timezone } = useTimezone();
  const [calendars, setCalendars] = useState<CalendarRead[]>([]);
  const [events, setEvents] = useState<EventRead[]>([]);
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
        listEvents({ start, end, calendar_id: selectedCalendar || undefined, limit: 200 }),
      ]);
      setCalendars(cals);
      setEvents(evts);
    } finally {
      setIsLoading(false);
    }
  }, [weekDates, selectedCalendar]);

  useEffect(() => { loadData(); }, [loadData]);

  // Navigation
  const goToPreviousWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const goToNextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());

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
      await createEvent({
        title,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        calendar_id: defaultCalendar.id,
        is_all_day: false,
        type: CALENDAR_EVENT_TYPE,
      });
      await loadData();
      setShowCreateModal(false);
    } catch (err) {
      console.error("Failed to create event:", err);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
        Loading calendar...
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CalendarHeader
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
      {viewMode === "week" ? (
        <WeekView weekDates={weekDates} calendars={calendars} events={filteredEvents} onCellClick={handleCellClick} />
      ) : (
        <ListView calendars={calendars} eventsByDate={eventsByDate} />
      )}
      {showCreateModal && newEventDate && (
        <CreateEventModal date={newEventDate} onClose={() => setShowCreateModal(false)} onCreate={handleCreateEvent} />
      )}
    </div>
  );
}
