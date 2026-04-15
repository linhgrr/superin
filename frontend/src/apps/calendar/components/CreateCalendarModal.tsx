import { useState } from "react";

import { useAsyncTask } from "@/hooks/useAsyncTask";

import type { CalendarRead } from "../api";

const DEFAULT_CALENDAR_COLOR = "#2563eb";

interface CreateCalendarModalProps {
  onClose: () => void;
  onCreate: (data: { color: string; name: string }) => Promise<CalendarRead>;
}

export function CreateCalendarModal({
  onClose,
  onCreate,
}: CreateCalendarModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_CALENDAR_COLOR);
  const [error, setError] = useState<string | null>(null);
  const { isPending, run } = useAsyncTask();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Calendar name is required.");
      return;
    }

    setError(null);

    try {
      await run(() =>
        onCreate({
          color,
          name: normalizedName,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create calendar.");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          boxShadow: "0 18px 48px rgba(0, 0, 0, 0.18)",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--color-foreground)",
              }}
            >
              Create Calendar
            </h2>
            <p
              style={{
                margin: "0.375rem 0 0",
                fontSize: "0.875rem",
                color: "var(--color-foreground-muted)",
              }}
            >
              Add a new calendar to organize events.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isPending}
            style={{ padding: "0.25rem 0.5rem" }}
          >
            Close
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div>
            <label
              htmlFor="calendar-name"
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--color-foreground-muted)",
                marginBottom: "0.375rem",
              }}
            >
              Name
            </label>
            <input
              id="calendar-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Work, Personal, Family"
              maxLength={50}
              autoFocus
              disabled={isPending}
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                background: "var(--color-surface-elevated)",
                color: "var(--color-foreground)",
                fontSize: "0.875rem",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="calendar-color"
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--color-foreground-muted)",
                marginBottom: "0.375rem",
              }}
            >
              Color
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <input
                id="calendar-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                disabled={isPending}
                style={{
                  width: "3rem",
                  height: "3rem",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.875rem",
                  color: "var(--color-foreground)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: "0.875rem",
                    height: "0.875rem",
                    borderRadius: "999px",
                    background: color,
                    border: "1px solid rgba(0, 0, 0, 0.08)",
                  }}
                />
                {color.toUpperCase()}
              </div>
            </div>
          </div>

          {error ? (
            <p
              style={{
                margin: 0,
                color: "var(--color-danger)",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              marginTop: "0.5rem",
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending}
            >
              {isPending ? "Creating..." : "Create Calendar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
