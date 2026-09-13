import { describe, expect, test } from "bun:test";

import type { CourtAvailability } from "@/types";

import { buildReminderMessage, shouldSendReminder } from "./reminders";

function booking(courtName: string, formattedStartTime: string): CourtAvailability {
  return {
    courtId: 0,
    courtName,
    formattedStartTime,
    startTimeInMinutes: 0,
    formattedDate: "Tue 15 Sep",
    dateISO: "2026-09-15",
    utc: "",
    isAvailable: false,
    isOwnBooking: true,
    offPeak: false,
  };
}

describe("shouldSendReminder", () => {
  test("sends from 09:00 onwards", () => {
    expect(shouldSendReminder("09:00", "2026-09-15", null)).toBe(true);
    expect(shouldSendReminder("11:30", "2026-09-15", null)).toBe(true);
  });

  test("stays quiet before 09:00", () => {
    expect(shouldSendReminder("08:55", "2026-09-15", null)).toBe(false);
  });

  test("sends only once a day", () => {
    expect(shouldSendReminder("09:05", "2026-09-15", "2026-09-15")).toBe(false);
  });

  test("sends again the next day", () => {
    expect(shouldSendReminder("09:05", "2026-09-16", "2026-09-15")).toBe(true);
  });
});

describe("buildReminderMessage", () => {
  test("names court and time for a single booking", () => {
    expect(buildReminderMessage([booking("Baan 13", "18:00")])).toBe("🎾 Squash today at 18:00 on Baan 13!");
  });

  test("lists every booking when there are several", () => {
    const message = buildReminderMessage([booking("Baan 13", "18:00"), booking("Baan 12", "19:30")]);

    expect(message).toBe("🎾 Squash today!\n\n• 18:00 — Baan 13\n• 19:30 — Baan 12");
  });
});
