import { useMemo, useState } from "react";

import { AppModal } from "@/shared/components/AppModal";
import {
  FORM_ACTIONS_STYLE,
  FORM_STACK_STYLE,
  FormCheckbox,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  FormValue,
} from "@/shared/components/FormControls";
import { useTimezone } from "@/shared/hooks/useTimezone";
import { formatDuration } from "../utils/dateHelpers";
import {
  createInitialEventFormState,
  isEventFormValid,
  normalizeEndMinutes,
  toEventFormData,
  type EventFormData,
} from "./create-event-form";
import { TimeInput } from "./TimeInput";

import type { CalendarRead, EventRead } from "../api";

import "./CreateEventModal.css";

interface CreateEventModalProps {
  date: Date;
  calendars: CalendarRead[];
  initialStartMinutes?: number;
  onClose: () => void;
  onCreate?: (data: EventFormData) => void;
  onUpdate?: (eventId: string, data: EventFormData) => void;
  onDelete?: (eventId: string) => void;
  initialEvent?: EventRead;
}

const TWO_COLUMN_GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
} as const;

// ─── Modal ────────────────────────────────────────────────────────────────────────

export function CreateEventModal({
  date,
  calendars,
  initialStartMinutes,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  initialEvent,
}: CreateEventModalProps) {
  const { formatDate, timezone } = useTimezone();
  const initialState = useMemo(
    () =>
      createInitialEventFormState({
        calendars,
        date,
        initialEvent,
        initialStartMinutes,
        timezone,
      }),
    [calendars, date, initialEvent, initialStartMinutes, timezone],
  );
  const [title, setTitle] = useState(initialState.title);
  const [description, setDescription] = useState(initialState.description);
  const [location, setLocation] = useState(initialState.location);
  const [calendarId, setCalendarId] = useState(initialState.calendarId);
  const [isAllDay, setIsAllDay] = useState(initialState.isAllDay);
  const [startMinutes, setStartMinutes] = useState(initialState.startMinutes);
  const [endMinutes, setEndMinutes] = useState(initialState.endMinutes);

  const handleStartChange = (value: number) => {
    setStartMinutes(value);
    setEndMinutes((current) => normalizeEndMinutes(value, current));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formState = { title, startMinutes, endMinutes, description, location, calendarId, isAllDay };
    if (!isEventFormValid(formState)) return;

    const formData = toEventFormData(formState);
    if (initialEvent && onUpdate) {
      onUpdate(initialEvent.id, formData);
    } else if (onCreate) {
      onCreate(formData);
    }
  };

  const isValid = isEventFormValid({
    title,
    startMinutes,
    endMinutes,
    description,
    location,
    calendarId,
    isAllDay,
  });

  return (
    <AppModal
      title={initialEvent ? "Edit Event" : "Create Event"}
      onClose={onClose}
      maxWidth={420}
    >
        {calendars.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-foreground-muted)" }}>
            <p style={{ marginBottom: "1rem" }}>You need a calendar to create events.</p>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={FORM_STACK_STYLE}>
            <FormField label="Date">
              <FormValue>
                {formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </FormValue>
            </FormField>

            <FormField htmlFor="event-title" label="Event Title" required>
              <FormInput
                id="event-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Team meeting, Doctor appointment..."
                autoFocus
              />
            </FormField>

            <div style={{ ...TWO_COLUMN_GRID_STYLE, opacity: isAllDay ? 0.5 : 1, pointerEvents: isAllDay ? "none" : "auto" }}>
              <TimeInput
                label="Start Time"
                value={startMinutes}
                onChange={handleStartChange}
              />
              <TimeInput
                label="End Time"
                value={endMinutes}
                onChange={(v) => setEndMinutes(v)}
                earliest={startMinutes + 1}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {!isAllDay ? (
                <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
                  Duration: {formatDuration(startMinutes, endMinutes)}
                </div>
              ) : (
                <div />
              )}

              <FormCheckbox
                checked={isAllDay}
                onChange={setIsAllDay}
                label="All-day event"
              />
            </div>

            <FormField htmlFor="event-calendar" label="Calendar" required>
              <FormSelect
                id="event-calendar"
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
              >
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>

            <FormField htmlFor="event-location" label="Location">
              <FormInput
                id="event-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
              />
            </FormField>

            <FormField htmlFor="event-description" label="Description">
              <FormTextarea
                id="event-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description"
                rows={3}
              />
            </FormField>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
              {initialEvent && onDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(initialEvent.id);
                  }}
                  className="btn btn-danger"
                >
                  Delete
                </button>
              ) : (
                <div />
              )}

              <div style={FORM_ACTIONS_STYLE}>
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!isValid}
                >
                  {initialEvent ? "Update Event" : "Add Event"}
                </button>
              </div>
            </div>
          </form>
        )}
    </AppModal>
  );
}
