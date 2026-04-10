import { DynamicIcon } from "@/lib/icon-resolver";
import type { RecurringFrequency } from "../api";

interface RecurringBadgeProps {
  frequency?: RecurringFrequency;
  isActive?: boolean;
}

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export default function RecurringBadge({ frequency = "daily", isActive = true }: RecurringBadgeProps) {
  if (!isActive) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.125rem 0.5rem",
        borderRadius: "999px",
        fontSize: "0.6875rem",
        fontWeight: 600,
        background: "var(--color-primary)",
        color: "var(--color-primary-foreground)",
      }}
      title={`Repeats ${frequency}`}
    >
      <DynamicIcon name="Repeat" size={10} />
      {FREQUENCY_LABELS[frequency]}
    </span>
  );
}
