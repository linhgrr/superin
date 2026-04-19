import { beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "@/constants/storage";

import {
  buildUtcIsoString,
  buildUtcIsoStringFromDate,
  dateInputValueToUtcIso,
  formatDate,
  formatDateTime,
  formatLongWeekdayDate,
  formatWeekdayDate,
  formatWeekdayDateTime,
  getDateKey,
  getDayRange,
  getWeekBoundaries,
  shiftDateKey,
  toDateInputValue,
} from "./datetime";

describe("datetime timezone utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("builds UTC instants from user timezone instead of browser local timezone", () => {
    localStorage.setItem(STORAGE_KEYS.USER_TIMEZONE, "Asia/Ho_Chi_Minh");

    expect(buildUtcIsoString(2026, 3, 13, 9, 30)).toBe("2026-04-13T02:30:00.000Z");
    expect(dateInputValueToUtcIso("2026-04-13")).toBe("2026-04-12T17:00:00.000Z");
  });

  it("preserves the user calendar day when converting between UTC and date-input values", () => {
    localStorage.setItem(STORAGE_KEYS.USER_TIMEZONE, "Asia/Ho_Chi_Minh");

    expect(toDateInputValue("2026-04-12T17:00:00.000Z")).toBe("2026-04-13");
    expect(getDateKey("2026-04-13T02:30:00.000Z", "Asia/Ho_Chi_Minh")).toBe("2026-04-13");
  });

  it("computes day and week query ranges in the configured timezone", () => {
    const anchor = new Date("2026-04-15T12:00:00.000Z");

    expect(getDayRange(anchor, "Asia/Ho_Chi_Minh")).toEqual({
      start: "2026-04-14T17:00:00.000Z",
      end: "2026-04-15T16:59:59.999Z",
    });

    expect(getWeekBoundaries(anchor, "Asia/Ho_Chi_Minh")).toMatchObject({
      rangeStartUtcIso: "2026-04-12T17:00:00.000Z",
      rangeEndUtcIso: "2026-04-19T16:59:59.999Z",
      weekDatesUtcIso: [
        "2026-04-12T17:00:00.000Z",
        "2026-04-13T17:00:00.000Z",
        "2026-04-14T17:00:00.000Z",
        "2026-04-15T17:00:00.000Z",
        "2026-04-16T17:00:00.000Z",
        "2026-04-17T17:00:00.000Z",
        "2026-04-18T17:00:00.000Z",
      ],
    });
  });

  it("reuses timezone-safe local dates when building event datetimes from calendar cells", () => {
    const week = getWeekBoundaries(new Date("2026-04-15T12:00:00.000Z"), "Asia/Ho_Chi_Minh");

    expect(buildUtcIsoStringFromDate(week.weekDatesLocal[0], 9, 0, "Asia/Ho_Chi_Minh")).toBe(
      "2026-04-13T02:00:00.000Z"
    );
  });

  it("shifts local date keys without involving the browser timezone", () => {
    expect(shiftDateKey("2026-04-30", 1)).toBe("2026-05-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("provides semantic weekday formatters on top of the same timezone-safe core", () => {
    const value = "2026-04-13T02:30:00.000Z";
    const timezone = "Asia/Ho_Chi_Minh";

    expect(formatWeekdayDate(value, timezone)).toBe(
      formatDate(value, timezone, { weekday: "short", month: "short", day: "numeric" })
    );
    expect(formatWeekdayDateTime(value, timezone)).toBe(
      formatDateTime(value, timezone, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    );
    expect(formatLongWeekdayDate(value, timezone)).toBe(
      formatDate(value, timezone, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    );
  });
});
