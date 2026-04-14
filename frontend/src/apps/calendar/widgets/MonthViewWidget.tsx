import type { DashboardWidgetRendererProps } from "../types";
import { useCallback, useState } from "react";
import { getWidgetData, type MonthViewWidgetData } from "../api";
import { useWidgetData } from "@/lib/widget-data";
import { useTimezone } from "@/shared/hooks/useTimezone";


export default function MonthViewWidget({ widget }: DashboardWidgetRendererProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const { getNow } = useTimezone();

  const { data, isLoading } = useWidgetData<MonthViewWidgetData>(
    "calendar",
    widget.id,
    () => getWidgetData(widget.id, { month_offset: monthOffset }) as Promise<MonthViewWidgetData>
  );

  const navigateMonth = useCallback(
    (delta: number) => {
      setMonthOffset((prev) => prev + delta);
    },
    []
  );

  // Get "today" in user's timezone for highlighting (string comparison — no Date object)
  const [todayDateStr] = getNow();
  const [todayYear, todayMonth, todayDay] = todayDateStr.split("-").map(Number);

  const month = data?.month != null ? data.month - 1 : todayMonth; // API returns 1-indexed
  const year = data?.year ?? todayYear;
  const monthLabel = data?.month_label ?? "";
  const startOffset = data?.start_offset ?? 0;
  const daysInMonth = data?.days_in_month ?? 0;
  const days = data?.days ?? [];
  const isCurrentMonth = todayMonth === month && todayYear === year;

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Build a lookup from day number to summary
  const dayMap = new Map(days.map((d) => [d.day, d]));

  const showLoading = isLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header — always visible for navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <button
          onClick={() => navigateMonth(-1)}
          disabled={showLoading}
          style={{
            padding: "0.375rem 0.75rem",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "6px",
            cursor: showLoading ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            opacity: showLoading ? 0.5 : 1,
          }}
        >
          ←
        </button>
        <div style={{ fontWeight: 600, fontSize: "1rem" }}>
          {monthLabel || "Loading…"}
        </div>
        <button
          onClick={() => navigateMonth(1)}
          disabled={showLoading}
          style={{
            padding: "0.375rem 0.75rem",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "6px",
            cursor: showLoading ? "not-allowed" : "pointer",
            fontSize: "0.875rem",
            opacity: showLoading ? 0.5 : 1,
          }}
        >
          →
        </button>
      </div>

      {showLoading && !data ? (
        <div style={{ color: "var(--color-foreground-muted)", fontSize: "0.875rem", textAlign: "center", padding: "1rem" }}>
          Loading…
        </div>
      ) : (
        <>
          {/* Day headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "4px",
              marginBottom: "0.5rem",
            }}
          >
            {dayNames.map((day) => (
              <div
                key={day}
                style={{
                  textAlign: "center",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--color-foreground-muted)",
                  padding: "0.25rem",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "4px",
              flex: 1,
              opacity: isLoading ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {/* Empty cells before first day */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} style={{ aspectRatio: "1" }} />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const daySummary = dayMap.get(day);
              const eventCount = daySummary?.event_count ?? 0;
              const eventTitles = daySummary?.event_titles ?? [];
              const isDayToday = isCurrentMonth && day === todayDay;

              return (
                <div
                  key={day}
                  style={{
                    aspectRatio: "1",
                    padding: "0.25rem",
                    background: isDayToday ? "var(--color-primary-muted)" : "var(--color-surface)",
                    borderRadius: "6px",
                    border: isDayToday ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: isDayToday ? 600 : 400,
                      color: isDayToday ? "var(--color-primary)" : "var(--color-foreground)",
                      textAlign: "right",
                    }}
                  >
                    {day}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px", flex: 1 }}>
                    {eventTitles.slice(0, 3).map((title, idx) => (
                      <div
                        key={idx}
                        style={{
                          height: "4px",
                          background: "var(--color-primary)",
                          borderRadius: "2px",
                        }}
                        title={title}
                      />
                    ))}
                    {eventCount > 3 && (
                      <div
                        style={{
                          fontSize: "0.625rem",
                          color: "var(--color-foreground-muted)",
                          textAlign: "center",
                        }}
                      >
                        +{eventCount - 3}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

