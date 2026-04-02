import { useState } from "react";
import { TIME_OPTIONS, formatDuration } from "../utils/dateHelpers";
import { useTimezone } from "@/hooks/useTimezone";

interface CreateEventModalProps {
  date: Date;
  onClose: () => void;
  onCreate: (title: string, startMinutes: number, endMinutes: number) => void;
}

export function CreateEventModal({ date, onClose, onCreate }: CreateEventModalProps) {
  const { formatDate } = useTimezone();
  const [title, setTitle] = useState("");
  const [startMinutes, setStartMinutes] = useState(9 * 60); // 9:00 AM default
  const [endMinutes, setEndMinutes] = useState(10 * 60); // 10:00 AM default

  // Update end time when start time changes to maintain minimum 30 min duration
  const handleStartChange = (value: number) => {
    setStartMinutes(value);
    if (value >= endMinutes) {
      setEndMinutes(value + 30);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onCreate(title.trim(), startMinutes, endMinutes);
    }
  };

  const durationText = formatDuration(startMinutes, endMinutes);

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
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ margin: "0 0 1rem", fontSize: "1.125rem" }}>Add Event</h3>

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

        {/* Start Time */}
        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--color-foreground-muted)",
              marginBottom: "0.25rem",
            }}
          >
            Start Time
          </label>
          <select
            value={startMinutes}
            onChange={(e) => handleStartChange(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "0.625rem",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              background: "var(--color-surface-elevated)",
              cursor: "pointer",
            }}
          >
            {TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* End Time */}
        <div style={{ marginBottom: "0.75rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--color-foreground-muted)",
              marginBottom: "0.25rem",
            }}
          >
            End Time
          </label>
          <select
            value={endMinutes}
            onChange={(e) => setEndMinutes(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "0.625rem",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              background: "var(--color-surface-elevated)",
              cursor: "pointer",
            }}
          >
            {TIME_OPTIONS.filter((opt) => opt.value > startMinutes).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--color-foreground-muted)",
              marginTop: "0.375rem",
            }}
          >
            Duration: {durationText}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.625rem 1rem",
              border: "1px solid var(--color-border)",
              background: "transparent",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || endMinutes <= startMinutes}
            style={{
              padding: "0.625rem 1rem",
              border: "none",
              background: "var(--color-primary)",
              color: "white",
              borderRadius: "8px",
              cursor: title.trim() && endMinutes > startMinutes ? "pointer" : "not-allowed",
              fontSize: "0.875rem",
              fontWeight: 500,
              opacity: title.trim() && endMinutes > startMinutes ? 1 : 0.5,
            }}
          >
            Add Event
          </button>
        </div>
      </form>
    </div>
  );
}
