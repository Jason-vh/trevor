import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";

import { BOOKING_HORIZON_DAYS, BOOKING_MINUTES } from "@/constants";
import { db } from "@/db";
import { queue, recurringBookings } from "@/db/schema";
import { getUpcomingReservations } from "@/modules/reservations";
import { addDaysISO, addMinutesToTime, getCurrentDateISO, lastDayOfMonth } from "@/utils/datetime";
import { projectWeeklySessions, type UpcomingSession, type UpcomingSessions } from "@/utils/upcoming-sessions";

const CALENDAR_WEEKS = 8;

async function getQueuedDatesByRule(): Promise<Map<number, Set<string>>> {
  const entries = await db
    .select({ ruleId: queue.recurringBookingId, date: queue.date })
    .from(queue)
    .where(isNotNull(queue.recurringBookingId));

  const byRule = new Map<number, Set<string>>();
  for (const { ruleId, date } of entries) {
    if (ruleId === null) continue;
    byRule.set(ruleId, (byRule.get(ruleId) ?? new Set()).add(date));
  }
  return byRule;
}

/** Booked courts, queued requests and the weeks weekly bookings will queue, from today to about two months out. */
export async function getUpcomingSessions(): Promise<UpcomingSessions> {
  const today = getCurrentDateISO();
  const until = lastDayOfMonth(addDaysISO(today, CALENDAR_WEEKS * 7));

  const [reservations, pending, rules, queuedDatesByRule] = await Promise.all([
    getUpcomingReservations(),
    db
      .select()
      .from(queue)
      .where(and(eq(queue.status, "pending"), gte(queue.date, today), lte(queue.date, until))),
    db.select().from(recurringBookings).where(isNull(recurringBookings.stoppedAt)),
    getQueuedDatesByRule(),
  ]);

  const booked = reservations.map(
    (reservation): UpcomingSession => ({
      date: reservation.dateISO,
      timeFrom: reservation.time,
      timeTo: addMinutesToTime(reservation.time, BOOKING_MINUTES),
      court: reservation.courtName,
      status: "booked",
    }),
  );
  const queued = pending.map(
    (entry): UpcomingSession => ({
      date: entry.date,
      timeFrom: entry.timeFrom,
      timeTo: entry.timeTo,
      court: null,
      status: "queued",
    }),
  );
  // Weeks SquashCity already takes bookings for are queued by the cron, or were left out as too soon.
  const firstUnopenedDate = addDaysISO(today, BOOKING_HORIZON_DAYS + 1);
  const weekly = projectWeeklySessions(rules, queuedDatesByRule, firstUnopenedDate, until);

  const sessions = [...booked, ...queued, ...weekly].sort(
    (a, b) => a.date.localeCompare(b.date) || a.timeFrom.localeCompare(b.timeFrom),
  );
  return { today, until, sessions };
}
