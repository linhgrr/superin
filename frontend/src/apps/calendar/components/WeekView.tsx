import { useMemo } from "react";
import { HOURS, HOUR_HEIGHT, DAY_NAMES } from "../utils/dateHelpers";
import { computeOverlappingEvents, computeEventPosition, formatEventTime, getColorStyleForEvent, splitEventsByType } from "../utils/eventHelpers";
import { isSameDayAs } from "@/shared/utils/datetime";
import type { CalendarRead, EventRead } from "../api";
import { useTimezone } from "@/shared/hooks/useTimezone";
import "./WeekView.css";

interface WeekViewProps {
  weekDates: Date[];       // Local midnight Date objects (Mon–Sun)
  calendars: CalendarRead[];
  events: EventRead[];
  onCellClick: (date: Date, hour: number) => void;
  onEventClick: (event: EventRead) => void;
}

export function WeekView({ weekDates, calendars: _calendars, events, onCellClick, onEventClick }: WeekViewProps) {
  const { timezone } = useTimezone();
  const today = new Date();

  // Memoize per-day filtering — uses isSameDayAs which takes explicit timezone
  const dayEventsMap = useMemo(() => {
    const map = new Map<string, EventRead[]>();
    for (const date of weekDates) {
      map.set(
        date.toDateString(),
        events.filter((e) => isSameDayAs(e.start_datetime, date, timezone)),
      );
    }
    return map;
  }, [weekDates, events, timezone]);

  // Memoize positioned events per day — avoids O(n²) recomputation on each render
  const positionedEventsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeOverlappingEvents>>();
    for (const date of weekDates) {
      const dayEvents = dayEventsMap.get(date.toDateString()) ?? [];
      map.set(date.toDateString(), computeOverlappingEvents(dayEvents, timezone));
    }
    return map;
  }, [dayEventsMap, timezone, weekDates]);


  return (
    <div className="week-view">
      {/* Day headers */}
      <div className="week-view__headers">
        <div />
        {weekDates.map((date, i) => {
          const isToday = isSameDayAs(date, today, timezone);
          return (
            <div key={i} className={`week-view__day-header${isToday ? " week-view__day-header--today" : ""}`}>
              <div className="week-view__day-name">{DAY_NAMES[i]}</div>
              <div className="week-view__day-number">{date.getDate()}</div>
            </div>
          );
        })}
      </div>
      
      {/* All-day row */}
      <div className="week-view__all-day-row">
        <div className="week-view__all-day-label">All day</div>
        {weekDates.map((date, i) => {
          const dayEvents = dayEventsMap.get(date.toDateString()) ?? [];
          const { allDay } = splitEventsByType(dayEvents, timezone);
          return (
            <div key={i} className="week-view__all-day-cell">
              {allDay.map(event => (
                <div 
                  key={event.id} 
                  className="week-view__all-day-chip"
                  style={getColorStyleForEvent(event.id)}
                  onClick={() => onEventClick(event)}
                >
                  {event.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="week-view__grid">
        {/* Time labels */}
        <div className="week-view__time-col">
          {HOURS.map((hour) => (
            <div key={hour} className="week-view__time-label">{hour}:00</div>
          ))}
        </div>

        {/* Day columns */}
        {weekDates.map((date, dayIndex) => {
          const positioned = positionedEventsMap.get(date.toDateString()) ?? [];
          const isToday = isSameDayAs(date, today, timezone);

          return (
            <div
              key={dayIndex}
              className={`week-view__day-col${isToday ? " week-view__day-col--today" : ""}`}
            >
              {/* Hour cells */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="week-view__hour-cell"
                  onClick={() => onCellClick(date, hour)}
                />
              ))}

              {/* Events overlay */}
              {positioned.map(({ event, topMinutes, heightMinutes, leftFrac, widthFrac, zIndex }) => {
                const pos = computeEventPosition(leftFrac, widthFrac, topMinutes, heightMinutes, HOUR_HEIGHT);

                return (
                  <div
                    key={event.id}
                    className="week-view__event"
                    style={{
                      ...pos,
                      ...getColorStyleForEvent(event.id),
                      zIndex,
                    }}
                    title={`${event.title}\n${formatEventTime(event.start_datetime, timezone)} - ${formatEventTime(event.end_datetime, timezone)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                  >
                    <div className="week-view__event-title">{event.title}</div>
                    {widthFrac > 0.2 && (
                      <div className="week-view__event-time">
                        {formatEventTime(event.start_datetime, timezone)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
