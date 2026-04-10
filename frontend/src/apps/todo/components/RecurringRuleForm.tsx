import { useState } from "react";
import type { FormEvent } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";
import type { CreateRecurringRuleRequest, RecurringFrequency } from "../api";

interface RecurringRuleFormProps {
  onSubmit: (data: CreateRecurringRuleRequest) => Promise<void>;
  onCancel: () => void;
}

const WEEKDAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
];

export default function RecurringRuleForm({ onSubmit, onCancel }: RecurringRuleFormProps) {
  const [frequency, setFrequency] = useState<RecurringFrequency>("daily");
  const [interval, setInterval] = useState(1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [endDate, setEndDate] = useState("");
  const [maxOccurrences, setMaxOccurrences] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const data: CreateRecurringRuleRequest = {
        frequency,
        interval,
        days_of_week: frequency === "weekly" && daysOfWeek.length > 0 ? daysOfWeek : undefined,
        end_date: endDate || undefined,
        max_occurrences: maxOccurrences ? Number(maxOccurrences) : undefined,
      };
      await onSubmit(data);
    } finally {
      setLoading(false);
    }
  }

  function toggleDay(day: number) {
    setDaysOfWeek((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--color-surface-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "0.75rem",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
        <DynamicIcon name="Repeat" size={16} style={{ color: "var(--color-primary)" }} />
        <span style={{ fontWeight: 500 }}>Make this task repeat</span>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "120px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-foreground-muted)",
            }}
          >
            Frequency
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
            style={{ width: "100%" }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: "100px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-foreground-muted)",
            }}
          >
            Every
          </label>
          <input
            type="number"
            min={1}
            max={52}
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {frequency === "weekly" && (
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 500,
              marginBottom: "0.5rem",
              color: "var(--color-foreground-muted)",
            }}
          >
            On days
          </label>
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                style={{
                  padding: "0.375rem 0.5rem",
                  borderRadius: "0.375rem",
                  border: "1px solid",
                  borderColor: daysOfWeek.includes(day.value)
                    ? "var(--color-primary)"
                    : "var(--color-border)",
                  background: daysOfWeek.includes(day.value)
                    ? "var(--color-primary)"
                    : "var(--color-surface)",
                  color: daysOfWeek.includes(day.value)
                    ? "var(--color-primary-foreground)"
                    : "var(--color-foreground-muted)",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "140px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-foreground-muted)",
            }}
          >
            End date (optional)
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: "140px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 500,
              marginBottom: "0.25rem",
              color: "var(--color-foreground-muted)",
            }}
          >
            Max times (optional)
          </label>
          <input
            type="number"
            min={1}
            max={1000}
            value={maxOccurrences}
            onChange={(e) => setMaxOccurrences(e.target.value)}
            placeholder="∞"
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <DynamicIcon name="Loader2" size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Set Recurring"}
        </button>
      </div>
    </form>
  );
}
