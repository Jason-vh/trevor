import { getSession } from "@/modules/session-manager";
import { getAllSlotsOnDate } from "@/modules/slots";
import { getNextDays } from "@/utils/datetime";
import { logger } from "@/utils/logger";

const RECENT_MAX_AGE_MS = 60 * 1000;

export type Reservation = {
  courtName: string;
  date: string;
  dateISO: string;
  time: string;
  reservationId: string | undefined;
};

let fetchCount = 0;
let recent: { reservations: Reservation[]; fetchNumber: number; fetchedAt: number } | null = null;
let backgroundRefresh: Promise<void> | null = null;

/** Our upcoming reservations, straight from SquashCity; also what `getRecentReservations` hands out next. */
export async function getUpcomingReservations(): Promise<Reservation[]> {
  const fetchNumber = ++fetchCount;
  const session = await getSession();
  const results = await Promise.allSettled(getNextDays(8).map((date) => getAllSlotsOnDate(session, date)));

  const reservations = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value.filter((s) => s.isOwnBooking) : []))
    .map((s) => ({
      courtName: s.courtName,
      date: s.formattedDate,
      dateISO: s.dateISO,
      time: s.formattedStartTime,
      reservationId: s.reservationId,
    }));

  // A fetch that started earlier but finished later holds older news.
  if (!recent || fetchNumber > recent.fetchNumber) {
    recent = { reservations, fetchNumber, fetchedAt: Date.now() };
  }
  return reservations;
}

/** Fetches our reservations again in the background, after we booked or cancelled or to keep them fresh. */
export function refreshReservations(): Promise<void> {
  return getUpcomingReservations().then(
    () => undefined,
    (error) => logger.warn("Reservations: refresh failed", { error }),
  );
}

/**
 * Our reservations as last fetched, without waiting on SquashCity unless we have none yet. Once they're a
 * minute old they're fetched again in the background, for the next caller.
 */
export async function getRecentReservations(): Promise<Reservation[]> {
  if (!recent) return getUpcomingReservations();
  if (Date.now() - recent.fetchedAt > RECENT_MAX_AGE_MS) {
    backgroundRefresh ??= refreshReservations().finally(() => {
      backgroundRefresh = null;
    });
  }
  return recent.reservations;
}
