import { and, eq, isNull } from "drizzle-orm";

import { BOOKING_HORIZON_DAYS } from "@/constants";
import { db } from "@/db";
import { queue, recurringBookings } from "@/db/schema";
import { enqueue } from "@/modules/queue";
import { getCurrentDateISO, getMinutesUntil, getWeekdayDates, type Weekday } from "@/utils/datetime";
import { logger } from "@/utils/logger";

// Weeks that start sooner than this are left out, like any booking that needs a clear yes first.
const MIN_MINUTES_AHEAD = 6 * 60;

export async function addRecurringBooking(chatId: string, weekday: Weekday, timeFrom: string, timeTo: string) {
  const [rule] = await db.insert(recurringBookings).values({ chatId, weekday, timeFrom, timeTo }).returning();
  logger.info("Recurring: added", { ...rule });
  await queueUpcomingWeeks();
  return rule;
}

export async function listRecurringBookings(chatId: string) {
  return db
    .select()
    .from(recurringBookings)
    .where(and(eq(recurringBookings.chatId, chatId), isNull(recurringBookings.stoppedAt)));
}

/** Stops a weekly booking and withdraws the weeks it queued that aren't booked yet. Booked courts stay. */
export async function stopRecurringBooking(id: number, chatId: string): Promise<boolean> {
  const stopped = await db
    .update(recurringBookings)
    .set({ stoppedAt: new Date() })
    .where(and(eq(recurringBookings.id, id), eq(recurringBookings.chatId, chatId), isNull(recurringBookings.stoppedAt)))
    .returning();

  if (stopped.length === 0) return false;

  await db
    .update(queue)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(queue.recurringBookingId, id), eq(queue.status, "pending")));

  logger.info("Recurring: stopped", { id, chatId });
  return true;
}

/**
 * Queues each week of every weekly booking once SquashCity takes bookings for it, 7 days ahead. A
 * week that was queued is never queued again, whatever became of it, so removing a week's entry
 * skips that week.
 */
export async function queueUpcomingWeeks(): Promise<void> {
  const today = getCurrentDateISO();
  const rules = await db.select().from(recurringBookings).where(isNull(recurringBookings.stoppedAt));

  for (const rule of rules) {
    const queuedDates = new Set(
      (await db.select({ date: queue.date }).from(queue).where(eq(queue.recurringBookingId, rule.id))).map(
        (entry) => entry.date,
      ),
    );

    for (const date of getWeekdayDates(rule.weekday as Weekday, today, BOOKING_HORIZON_DAYS)) {
      if (queuedDates.has(date)) continue;
      if (getMinutesUntil(date, rule.timeFrom) < MIN_MINUTES_AHEAD) continue;

      const entry = await enqueue({
        chatId: rule.chatId,
        date,
        timeFrom: rule.timeFrom,
        timeTo: rule.timeTo,
        recurringBookingId: rule.id,
      });
      logger.info("Recurring: queued a week", { ruleId: rule.id, entryId: entry.id, date });
    }
  }
}
