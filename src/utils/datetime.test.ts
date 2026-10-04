import { describe, expect, test } from "bun:test";

import { formatMessageTime, getMinutesUntil } from "./datetime";

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
