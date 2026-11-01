import { describe, expect, mock, test } from "bun:test";

import type { CourtAvailability } from "@/types";

type Fetch = { courts: string[]; resolve: () => void };
const fetches: Fetch[] = [];
let courts = ["Baan 1"];

function slot(courtName: string, date: Date): CourtAvailability {
  const dateISO = date.toISOString().slice(0, 10);
  return {
    courtId: 1,
    courtName,
    formattedStartTime: "18:30",
    startTimeInMinutes: 1110,
    formattedDate: dateISO,
    dateISO,
    utc: "0",
    isAvailable: false,
    isOwnBooking: true,
    offPeak: false,
  };
}

mock.module("@/modules/session-manager", () => ({ getSession: async () => ({ cookies: [] }) }));
mock.module("@/modules/slots", () => ({
  // One own booking per fetch, on the first day only; each fetch waits until the test lets it finish.
  getAllSlotsOnDate: (_session: unknown, date: Date) => {
    const isFirstDay = date.toDateString() === new Date().toDateString();
    if (!isFirstDay) return Promise.resolve([]);
    const fetch: Fetch = { courts: [...courts], resolve: () => {} };
    fetches.push(fetch);
    return new Promise<CourtAvailability[]>((resolve) => {
      fetch.resolve = () => resolve(fetch.courts.map((court) => slot(court, date)));
    });
  },
}));

const { getRecentReservations, getUpcomingReservations } = await import("./reservations");

function courtsOf(reservations: { courtName: string }[]) {
  return reservations.map((reservation) => reservation.courtName);
}

describe("reservations", () => {
  test("the first read waits for SquashCity, later reads use what it returned", async () => {
    const first = getRecentReservations();
    await Bun.sleep(0);
    fetches.at(-1)?.resolve();
    expect(courtsOf(await first)).toEqual(["Baan 1"]);

    const fetchesBefore = fetches.length;
    expect(courtsOf(await getRecentReservations())).toEqual(["Baan 1"]);
    expect(fetches.length).toBe(fetchesBefore);
  });

  test("an older fetch that finishes last doesn't overwrite a newer one", async () => {
    courts = ["Baan 2"];
    const older = getUpcomingReservations();
    await Bun.sleep(0);
    const olderFetch = fetches.at(-1);

    courts = ["Baan 3"];
    const newer = getUpcomingReservations();
    await Bun.sleep(0);
    fetches.at(-1)?.resolve();
    await newer;

    olderFetch?.resolve();
    await older;

    expect(courtsOf(await getRecentReservations())).toEqual(["Baan 3"]);
  });
});
