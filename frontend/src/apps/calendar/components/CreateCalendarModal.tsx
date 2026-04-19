import { useState } from "react";
import type { FormEvent } from "react";

import { useAsyncTask } from "@/hooks/useAsyncTask";
import { AppModal } from "@/shared/components/AppModal";
import {
  FORM_ACTIONS_STYLE,
  FORM_STACK_STYLE,
  FormField,
  FormInput,
  FormMessage,
} from "@/shared/components/FormControls";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
    <AppModal
      title="Create Calendar"
      description="Add a new calendar to organize events."
      onClose={onClose}
      maxWidth={420}
      closeDisabled={isPending}
    >
      <form
        onSubmit={handleSubmit}
        style={FORM_STACK_STYLE}
      >
        <FormField htmlFor="calendar-name" label="Name" required>
          <FormInput
            id="calendar-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Work, Personal, Family"
            maxLength={50}
            autoFocus
            disabled={isPending}
          />
        </FormField>

        <FormField htmlFor="calendar-color" label="Color">
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
        </FormField>

        {error ? (
          <FormMessage>{error}</FormMessage>
        ) : null}

        <div style={FORM_ACTIONS_STYLE}>
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
    </AppModal>
  );
}
