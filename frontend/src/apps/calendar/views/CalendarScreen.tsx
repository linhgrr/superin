/**
 * CalendarScreen — calendar with week/list view and event management.
 */

import { useState, useMemo, useCallback } from "react";

import { useToast } from "@/components/providers/ToastProvider";
import { useAsyncTask } from "@/hooks/useAsyncTask";
import { useDisclosure } from "@/hooks/useDisclosure";
import { ConfirmationModal } from "@/shared/components/ConfirmationModal";
import { useTimezone } from "@/shared/hooks/useTimezone";
import { buildUtcIsoStringFromDate } from "@/shared/utils/datetime";

import { CreateCalendarModal } from "../components/CreateCalendarModal";
import { CreateEventModal } from "../components/CreateEventModal";
import { ListView } from "../components/ListView";
import { WeekView } from "../components/WeekView";
import type { CreateEventRequest, EventRead } from "../api";
import { filterEventsByCalendar, groupEventsByDate } from "../utils/eventHelpers";
import {
  createCalendar as swrCreateCalendar,
  createEvent as swrCreateEvent,
  deleteEvent as swrDeleteEvent,
  updateEvent as swrUpdateEvent,
  useCalendars,
  useEvents,
} from "../hooks/useCalendarSwr";
import { CalendarHeader } from "./CalendarHeader";
import type { EventFormData } from "../components/CreateEventModal";

export type ViewMode = "list" | "week";
const CALENDAR_EVENT_TYPE: CreateEventRequest["type"] = "event";
interface EventSlotSelection {
  date: Date;
  startMinutes: number;
}

export default function CalendarScreen() {
  const { timezone, getWeekBoundaries } = useTimezone();
  const toast = useToast();
  const { run: runCreateCalendar } = useAsyncTask();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCalendar, setSelectedCalendar] = useState<string | null>(null);
  const [newEventSlot, setNewEventSlot] = useState<EventSlotSelection | null>(null);
  const [selectedEventForUpdate, setSelectedEventForUpdate] = useState<EventRead | null>(null);
  const [eventToDeleteId, setEventToDeleteId] = useState<string | null>(null);
  const {
    close: closeCreateCalendarDisclosure,
    isOpen: isCreateCalendarModalOpen,
    open: openCreateCalendarModal,
  } = useDisclosure();
  const { close: closeCreateEventDisclosure, isOpen: isCreateEventModalOpen, open: openCreateEventModal } = useDisclosure();
  const { close: closeDeleteConfirmDisclosure, isOpen: isDeleteConfirmModalOpen, open: openDeleteConfirmModal } = useDisclosure();

  // getWeekBoundaries gives both:
  //   - weekDatesLocal: Date[7] at local midnight (for grid columns)
  //   - weekDatesUtcIso: string[7] UTC ISO strings (for API query)
  const weekInfo = useMemo(
    () => getWeekBoundaries(currentDate),
    [getWeekBoundaries, currentDate],
  );

  // SWR data — query with UTC ISO range
  const { data: calendars = [], isLoading: calendarsLoading } = useCalendars();
  const { data: events = [], isLoading: eventsLoading } = useEvents(
    weekInfo.rangeStartUtcIso,
    weekInfo.rangeEndUtcIso,
    selectedCalendar ?? undefined,
    200,
  );
  const isLoading = calendarsLoading || eventsLoading;

  const filteredEvents = useMemo(
    () => filterEventsByCalendar({ events, selectedCalendar }),
    [events, selectedCalendar],
  );
  const eventsByDate = useMemo(
    () => groupEventsByDate(filteredEvents, timezone),
    [filteredEvents, timezone],
  );

  // Navigation — useCallback to avoid re-renders
  const goToPreviousWeek = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);

  const goToToday = useCallback(() => setCurrentDate(new Date()), []);

  const handleCellClick = useCallback((date: Date, hour: number) => {
    setNewEventSlot({
      date,
      startMinutes: hour * 60,
    });
    openCreateEventModal();
  }, [openCreateEventModal]);

  const closeCreateEventModal = useCallback(() => {
    closeCreateEventDisclosure();
    setNewEventSlot(null);
  }, [closeCreateEventDisclosure]);

  const closeDeleteConfirmModal = useCallback(() => {
    closeDeleteConfirmDisclosure();
    setEventToDeleteId(null);
  }, [closeDeleteConfirmDisclosure]);

  const handleCreateCalendar = useCallback(
    async (formData: { color: string; name: string }) => {
      const calendar = await runCreateCalendar(() => swrCreateCalendar(formData));
      setSelectedCalendar(calendar.id);
      closeCreateCalendarDisclosure();
      toast.success("Calendar created successfully");
      return calendar;
    },
    [closeCreateCalendarDisclosure, runCreateCalendar, toast]
  );

  // ── Event creation ────────────────────────────────────────────────────────
  // buildUtcIsoStringFromDate converts the selected calendar day in the user's
  // configured timezone into a UTC ISO string for the API.
  const handleCreateEvent = useCallback(
    async (formData: EventFormData) => {
      if (!newEventSlot) return;
      if (calendars.length === 0) {
        toast.error("Please create a calendar first.");
        return;
      }
      
      const start_hour = Math.floor(formData.startMinutes / 60);
      const start_min = formData.startMinutes % 60;
      const end_hour = Math.floor(formData.endMinutes / 60);
      const end_min = formData.endMinutes % 60;

      try {
        await swrCreateEvent({
          title: formData.title,
          start_datetime: buildUtcIsoStringFromDate(newEventSlot.date, start_hour, start_min, timezone),
          end_datetime: buildUtcIsoStringFromDate(newEventSlot.date, end_hour, end_min, timezone),
          calendar_id: formData.calendar_id,
          is_all_day: formData.is_all_day,
          description: formData.description || null,
          location: formData.location || null,
          type: CALENDAR_EVENT_TYPE,
        });
        toast.success("Event created successfully");
        closeCreateEventModal();
      } catch (err: unknown) {
        console.error("Failed to create event:", err);
        const errorMessage = (err as { message?: string; detail?: string })?.message
          || (err as { detail?: string })?.detail
          || "Failed to create event";
        toast.error(errorMessage);
      }
    },
    [calendars, closeCreateEventModal, newEventSlot, timezone, toast],
  );

  const handleUpdateEvent = useCallback(
    async (eventId: string, formData: EventFormData) => {
      if (!selectedEventForUpdate) return;
      // We need the original date for the event to keep it on the same day but different time
      const date = new Date(selectedEventForUpdate.start_datetime);
      const start_hour = Math.floor(formData.startMinutes / 60);
      const start_min = formData.startMinutes % 60;
      const end_hour = Math.floor(formData.endMinutes / 60);
      const end_min = formData.endMinutes % 60;

      try {
        await swrUpdateEvent(eventId, {
          title: formData.title,
          start_datetime: buildUtcIsoStringFromDate(date, start_hour, start_min, timezone),
          end_datetime: buildUtcIsoStringFromDate(date, end_hour, end_min, timezone),
          calendar_id: formData.calendar_id,
          is_all_day: formData.is_all_day,
          description: formData.description || null,
          location: formData.location || null,
        });
        setSelectedEventForUpdate(null);
      } catch (err) {
        console.error("Failed to update event:", err);
      }
    },
    [selectedEventForUpdate, timezone],
  );

  const handleDeleteEvent = useCallback(
    async (eventId: string) => {
      setEventToDeleteId(eventId);
      openDeleteConfirmModal();
    },
    [openDeleteConfirmModal],
  );

  const confirmDelete = useCallback(async () => {
    if (!eventToDeleteId) return;
    try {
      await swrDeleteEvent(eventToDeleteId);
      toast.success("Event deleted successfully");
      
      // Close all modals and reset state
      closeDeleteConfirmModal();
      setSelectedEventForUpdate(null);
      closeCreateEventModal();
    } catch (err) {
      console.error("Failed to delete event:", err);
      toast.error("Failed to delete event");
    }
  }, [closeCreateEventModal, closeDeleteConfirmModal, eventToDeleteId, toast]);

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
        weekDates={weekInfo.weekDatesLocal}
        calendars={calendars}
        selectedCalendar={selectedCalendar}
        viewMode={viewMode}
        onPreviousWeek={goToPreviousWeek}
        onNextWeek={goToNextWeek}
        onToday={goToToday}
        onSelectCalendar={setSelectedCalendar}
        onChangeView={setViewMode}
        onCreateCalendar={openCreateCalendarModal}
      />
      {viewMode === "week" ? (
        <WeekView
          weekDates={weekInfo.weekDatesLocal}
          calendars={calendars}
          events={filteredEvents}
          onCellClick={handleCellClick}
          onEventClick={setSelectedEventForUpdate}
        />
      ) : (
        <ListView 
          calendars={calendars} 
          eventsByDate={eventsByDate} 
          onEventClick={setSelectedEventForUpdate}
        />
      )}
      {isCreateCalendarModalOpen ? (
        <CreateCalendarModal
          onClose={closeCreateCalendarDisclosure}
          onCreate={handleCreateCalendar}
        />
      ) : null}
      {isCreateEventModalOpen && newEventSlot && !selectedEventForUpdate && (
        <CreateEventModal
          date={newEventSlot.date}
          calendars={calendars}
          initialStartMinutes={newEventSlot.startMinutes}
          onClose={closeCreateEventModal}
          onCreate={handleCreateEvent}
        />
      )}
      {selectedEventForUpdate && (
        <CreateEventModal
          date={new Date(selectedEventForUpdate.start_datetime)}
          calendars={calendars}
          initialEvent={selectedEventForUpdate}
          onClose={() => setSelectedEventForUpdate(null)}
          onUpdate={handleUpdateEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {isDeleteConfirmModalOpen && (
        <ConfirmationModal
          title="Delete Event"
          message="Are you sure you want to delete this event? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={closeDeleteConfirmModal}
        />
      )}
    </div>
  );
}
