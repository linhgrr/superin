import { useState, useRef, useEffect } from "react";
import { TIME_OPTIONS, formatDuration, parseTimeString, formatMinutesToString } from "../utils/dateHelpers";
import { useTimezone } from "@/shared/hooks/useTimezone";
import "./CreateEventModal.css";

import type { CalendarRead, EventRead } from "../api";

export interface EventFormData {
  title: string;
  startMinutes: number;
  endMinutes: number;
  description: string;
  location: string;
  calendar_id: string;
  is_all_day: boolean;
}

interface CreateEventModalProps {
  date: Date;
  calendars: CalendarRead[];
  onClose: () => void;
  onCreate?: (data: EventFormData) => void;
  onUpdate?: (eventId: string, data: EventFormData) => void;
  onDelete?: (eventId: string) => void;
  initialEvent?: EventRead;
}

// ─── Time input with both text input and dropdown ────────────────────────────────

interface TimeInputProps {
  label: string;
  value: number; // total minutes from midnight
  onChange: (minutes: number) => void;
  earliest?: number; // minimum allowed value (minutes)
}

function TimeInput({ label, value, onChange, earliest }: TimeInputProps) {
  const [textValue, setTextValue] = useState(() => formatMinutesToString(value));
  const [open, setOpen] = useState(false);
  const [textError, setTextError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep text display in sync when value changes externally
  useEffect(() => {
    setTextValue(formatMinutesToString(value));
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const applyValue = (mins: number) => {
    const effective = earliest !== undefined ? Math.max(mins, earliest) : mins;
    onChange(effective);
    setTextValue(formatMinutesToString(effective));
    setTextError(false);
    setOpen(false);
  };

  const handleTextChange = (raw: string) => {
    setTextValue(raw);
    const parsed = parseTimeString(raw);
    if (parsed !== null && (!earliest || parsed >= earliest)) {
      setTextError(false);
    } else {
      setTextError(true);
    }
  };

  const handleTextBlur = () => {
    const parsed = parseTimeString(textValue);
    if (parsed !== null && (!earliest || parsed >= earliest)) {
      applyValue(parsed);
    } else {
      // Revert to current value
      setTextValue(formatMinutesToString(value));
      setTextError(false);
    }
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setTextValue(formatMinutesToString(value));
      setTextError(false);
      setOpen(false);
    }
  };

  const options = earliest !== undefined
    ? TIME_OPTIONS.filter((o) => o.value >= earliest)
    : TIME_OPTIONS;

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "0.75rem",
          color: "var(--color-foreground-muted)",
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </label>
      <div ref={containerRef} style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={textValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
          placeholder="HH:MM"
          maxLength={5}
          style={{
            width: "100%",
            padding: "0.625rem",
            border: `1px solid ${textError ? "var(--color-danger)" : "var(--color-border)"}`,
            borderRadius: "8px",
            fontSize: "0.875rem",
            background: "var(--color-surface-elevated)",
            outline: "none",
          }}
        />
        {/* Dropdown list */}
        {open && (
          <ul className="time-dropdown">
            {options.map((opt) => (
              <li
                key={opt.value}
                className="time-dropdown-item"
                onMouseDown={() => applyValue(opt.value)}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────────

export function CreateEventModal({ date, calendars, onClose, onCreate, onUpdate, onDelete, initialEvent }: CreateEventModalProps) {
  const { formatDate } = useTimezone();
  const [title, setTitle] = useState(initialEvent ? initialEvent.title : "");
  const [description, setDescription] = useState(initialEvent?.description || "");
  const [location, setLocation] = useState(initialEvent?.location || "");
  const [calendarId, setCalendarId] = useState(initialEvent?.calendar_id || (calendars.length > 0 ? calendars[0].id : ""));
  const [isAllDay, setIsAllDay] = useState(initialEvent?.is_all_day || false);
  
  const getInitialMinutes = () => {
    if (initialEvent) {
      // Dùng hàm từ dateHelpers để lấy chính xác giờ phút theo locale
      const startLocal = new Date(initialEvent.start_datetime);
      const endLocal = new Date(initialEvent.end_datetime);
      // NOTE: getHourMinute handles TZ correctly on display, but here we can just calc difference?
      // Since dateHelpers formatEventTime etc handles timezone.
      // Let's use standard local logic inside modal, since `CreateEventModal` builds from components.
      return {
        start: startLocal.getHours() * 60 + startLocal.getMinutes(),
        end: endLocal.getHours() * 60 + endLocal.getMinutes(),
      };
    }
    const start = date.getHours() * 60 + date.getMinutes();
    return { start, end: start + 60 };
  };

  const [startMinutes, setStartMinutes] = useState(getInitialMinutes().start);
  const [endMinutes, setEndMinutes] = useState(getInitialMinutes().end);

  const handleStartChange = (value: number) => {
    setStartMinutes(value);
    if (value >= endMinutes) {
      setEndMinutes(value + 30);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && calendarId) {
      const formData: EventFormData = {
        title: title.trim(),
        startMinutes,
        endMinutes,
        description: description.trim(),
        location: location.trim(),
        calendar_id: calendarId,
        is_all_day: isAllDay,
      };
      
      if (initialEvent && onUpdate) {
        onUpdate(initialEvent.id, formData);
      } else if (onCreate) {
        onCreate(formData);
      }
    }
  };

  const durationText = formatDuration(startMinutes, endMinutes);
  const isValid = title.trim() && endMinutes > startMinutes;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          borderRadius: "12px",
          padding: "1.5rem",
          width: "420px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ margin: "0 0 1rem", fontSize: "1.125rem" }}>
          {initialEvent ? "Edit Event" : "Add Event"}
        </h3>

        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--color-foreground-muted)",
              marginBottom: "0.25rem",
            }}
          >
            Date
          </label>
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            {formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--color-foreground-muted)",
              marginBottom: "0.25rem",
            }}
          >
            Event Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Team meeting, Doctor appointment..."
            autoFocus
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              background: "var(--color-surface-elevated)",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", opacity: isAllDay ? 0.5 : 1, pointerEvents: isAllDay ? "none" : "auto" }}>
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", marginTop: "0.5rem" }}>
          {!isAllDay ? (
            <div style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)" }}>
              Duration: {durationText}
            </div>
          ) : (
            <div />
          )}
          
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
            <input 
              type="checkbox" 
              checked={isAllDay} 
              onChange={(e) => setIsAllDay(e.target.checked)} 
              style={{ width: "auto", margin: 0, cursor: "pointer" }}
            />
            All-day event
          </label>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--color-foreground-muted)",
              marginBottom: "0.25rem",
            }}
          >
            Calendar *
          </label>
          <select
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              background: "var(--color-surface-elevated)",
              color: "var(--color-foreground)",
            }}
          >
            {calendars.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        
        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--color-foreground-muted)",
              marginBottom: "0.25rem",
            }}
          >
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add location"
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              background: "var(--color-surface-elevated)",
              color: "var(--color-foreground)",
            }}
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--color-foreground-muted)",
              marginBottom: "0.25rem",
            }}
          >
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description"
            rows={3}
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              background: "var(--color-surface-elevated)",
              color: "var(--color-foreground)",
              resize: "vertical",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
          {initialEvent && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete(initialEvent.id);
              }}
              style={{
                padding: "0.625rem 1rem",
                border: "1px solid var(--color-danger-muted-border)",
                background: "var(--color-danger-muted-bg)",
                color: "var(--color-danger)",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Delete
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "0.625rem 1rem",
                border: "1px solid var(--color-border)",
                background: "transparent",
                color: "var(--color-foreground)",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              style={{
                padding: "0.625rem 1rem",
                border: "none",
                background: "var(--color-primary)",
                color: "white",
                borderRadius: "8px",
                cursor: isValid ? "pointer" : "not-allowed",
                fontSize: "0.875rem",
                fontWeight: 500,
                opacity: isValid ? 1 : 0.5,
              }}
            >
              {initialEvent ? "Update Event" : "Add Event"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
