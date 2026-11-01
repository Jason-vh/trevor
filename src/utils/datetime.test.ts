import { describe, expect, test } from "bun:test";

import {
  addDaysISO,
  addMinutesToTime,
  formatMessageTime,
  getMinutesUntil,
  getWeekdayDates,
  lastDayOfMonth,
  zonedTimeToUtc,
} from "./datetime";

describe("getMinutesUntil", () => {
  // 14:00 in Amsterdam (CEST)
  const now = new Date("2026-07-21T12:00:00Z");

  test("counts minutes until a time later today", () => {
    expect(getMinutesUntil("2026-07-21", "18:30", now)).toBe(270);
  });

  test("counts across days", () => {
    expect(getMinutesUntil("2026-07-22", "09:00", now)).toBe(19 * 60);
  });

  test("is negative once the time has passed", () => {
    expect(getMinutesUntil("2026-07-21", "13:15", now)).toBe(-45);
  });

  test("uses the Amsterdam date, not the UTC date", () => {
    // 00:30 on 22 July in Amsterdam, still 21 July in UTC
    const justAfterMidnight = new Date("2026-07-21T22:30:00Z");
    expect(getMinutesUntil("2026-07-22", "06:30", justAfterMidnight)).toBe(360);
  });
});

describe("formatMessageTime", () => {
  test("shows the weekday, date and Amsterdam time", () => {
    expect(formatMessageTime(new Date("2026-07-21T16:05:00Z"))).toBe("Tue 21 Jul 2026 18:05");
  });
});

describe("getWeekdayDates", () => {
  test("lists every matching weekday in the range, including both ends", () => {
    // 2026-10-06 is a Tuesday
    expect(getWeekdayDates("tuesday", "2026-10-06", 14)).toEqual(["2026-10-06", "2026-10-13", "2026-10-20"]);
  });

  test("crosses month and year boundaries", () => {
    expect(getWeekdayDates("thursday", "2026-12-28", 7)).toEqual(["2026-12-31"]);
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("addMinutesToTime", () => {
  test("adds a booking's length", () => {
    expect(addMinutesToTime("18:30", 45)).toBe("19:15");
  });

  test("wraps past midnight", () => {
    expect(addMinutesToTime("23:30", 45)).toBe("00:15");
  });
});

describe("zonedTimeToUtc", () => {
  test("uses summer time in summer", () => {
    expect(zonedTimeToUtc("2026-07-21", "18:30").toISOString()).toBe("2026-07-21T16:30:00.000Z");
  });

  test("uses winter time in winter", () => {
    expect(zonedTimeToUtc("2026-12-01", "18:30").toISOString()).toBe("2026-12-01T17:30:00.000Z");
  });

  test("handles the day the clocks go forward", () => {
    expect(zonedTimeToUtc("2026-03-29", "19:00").toISOString()).toBe("2026-03-29T17:00:00.000Z");
  });
});

describe("lastDayOfMonth", () => {
  test("handles month lengths and leap years", () => {
    expect(lastDayOfMonth("2026-11-01")).toBe("2026-11-30");
    expect(lastDayOfMonth("2026-12-15")).toBe("2026-12-31");
    expect(lastDayOfMonth("2028-02-03")).toBe("2028-02-29");
  });
});
