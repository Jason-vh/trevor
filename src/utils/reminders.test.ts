import { describe, expect, test } from "bun:test";

import type { CourtAvailability } from "@/types";

import { buildReminderTask, groupBookingsByChat, shouldSendReminder } from "./reminders";

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

describe("groupBookingsByChat", () => {
  test("groups bookings by the chat that asked for them", () => {
    const origins = new Map([
      ["18:00 Baan 13", "-100"],
      ["19:30 Baan 12", "-100"],
      ["20:15 Baan 3", "42"],
    ]);
    const bookings = [booking("Baan 13", "18:00"), booking("Baan 12", "19:30"), booking("Baan 3", "20:15")];

    const { byChat, withoutChat } = groupBookingsByChat(bookings, origins);

    expect([...byChat.keys()]).toEqual(["-100", "42"]);
    expect(byChat.get("-100")?.map((b) => b.courtName)).toEqual(["Baan 13", "Baan 12"]);
    expect(withoutChat).toEqual([]);
  });

  test("keeps bookings made outside Trevor apart", () => {
    const { byChat, withoutChat } = groupBookingsByChat([booking("Baan 1", "18:00")], new Map());

    expect(byChat.size).toBe(0);
    expect(withoutChat.map((b) => b.courtName)).toEqual(["Baan 1"]);
  });
});

describe("buildReminderTask", () => {
  test("lists every court and time booked for the chat", () => {
    const task = buildReminderTask([booking("Baan 13", "18:00"), booking("Baan 12", "19:30")]);

    expect(task).toContain("• 18:00 — Baan 13\n• 19:30 — Baan 12");
  });
});
