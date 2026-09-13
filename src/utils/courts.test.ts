import { describe, expect, test } from "bun:test";

import type { CourtAvailability, CourtTier } from "@/types";

import { normalizeCourtName, sortSlotsByPreference } from "./courts";

const TIERS = new Map<string, CourtTier>([
  ["Baan 12", "preferred"],
  ["Baan 1", "avoided"],
]);

function slot(courtName: string, formattedStartTime: string, dateISO = "2026-03-17"): CourtAvailability {
  const [hours, minutes] = formattedStartTime.split(":").map(Number);

  return {
    courtId: parseInt(courtName.replace("Baan ", "")),
    courtName,
    formattedStartTime,
    startTimeInMinutes: hours * 60 + minutes,
    formattedDate: dateISO,
    dateISO,
    utc: "",
    isAvailable: true,
    isOwnBooking: false,
    offPeak: false,
  };
}

describe("sortSlotsByPreference", () => {
  test("ranks preferred courts first within the same time", () => {
    const sorted = sortSlotsByPreference(
      [slot("Baan 1", "18:00"), slot("Baan 5", "18:00"), slot("Baan 12", "18:00")],
      TIERS,
    );

    expect(sorted.map((s) => s.courtName)).toEqual(["Baan 12", "Baan 5", "Baan 1"]);
  });

  test("prefers an earlier time over a better court", () => {
    const sorted = sortSlotsByPreference([slot("Baan 12", "19:00"), slot("Baan 1", "18:00")], TIERS);

    expect(sorted.map((s) => s.formattedStartTime)).toEqual(["18:00", "19:00"]);
  });

  test("orders earlier dates first", () => {
    const sorted = sortSlotsByPreference(
      [slot("Baan 12", "18:00", "2026-03-18"), slot("Baan 1", "20:00", "2026-03-17")],
      TIERS,
    );

    expect(sorted.map((s) => s.dateISO)).toEqual(["2026-03-17", "2026-03-18"]);
  });

  test("treats unlisted courts as neutral", () => {
    const sorted = sortSlotsByPreference([slot("Baan 1", "18:00"), slot("Baan 7", "18:00")], TIERS);

    expect(sorted.map((s) => s.courtName)).toEqual(["Baan 7", "Baan 1"]);
  });

  test("leaves the input untouched", () => {
    const slots = [slot("Baan 1", "18:00"), slot("Baan 12", "18:00")];
    sortSlotsByPreference(slots, TIERS);

    expect(slots.map((s) => s.courtName)).toEqual(["Baan 1", "Baan 12"]);
  });
});

describe("normalizeCourtName", () => {
  test.each([
    ["12", "Baan 12"],
    ["baan 12", "Baan 12"],
    ["Baan 12", "Baan 12"],
    ["court 3", "Baan 3"],
    ["baan 03", "Baan 3"],
  ])("normalizes %p to %p", (input, expected) => {
    expect(normalizeCourtName(input)).toBe(expected);
  });

  test("returns null when there is no court number", () => {
    expect(normalizeCourtName("the glass one")).toBeNull();
  });
});
