import { and, desc, eq, lt, lte } from "drizzle-orm";

import { db } from "@/db";
import { queue } from "@/db/schema";
import { createTentativeEvent } from "@/modules/calendar";
import { BOOKING_HORIZON_DAYS } from "@/constants";
import { addDaysISO, getCurrentDateISO } from "@/utils/datetime";
import { logger } from "@/utils/logger";

export async function resetStaleProcessingEntries() {
  const result = await db
    .update(queue)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(queue.status, "processing"))
    .returning({ id: queue.id });
  if (result.length > 0) {
    logger.warn("Queue: reset stale processing entries", {
      count: result.length,
      ids: result.map((r) => r.id),
    });
  }
}

/** Queues a booking request, with a placeholder event in the calendar. */
export async function enqueue(request: {
  chatId: string;
  date: string;
  timeFrom: string;
  timeTo: string;
  recurringBookingId?: number;
}) {
  const [entry] = await db
    .insert(queue)
    .values({ ...request, status: "pending" })
    .returning();

  const calendarEventId = await createTentativeEvent(request.date, request.timeFrom, request.timeTo);
  if (calendarEventId) {
    await db.update(queue).set({ calendarEventId }).where(eq(queue.id, entry.id));
  }

  return entry;
}

export async function listPendingQueue() {
  return db.select().from(queue).where(eq(queue.status, "pending"));
}

export async function removeFromQueue(id: number) {
  await db.update(queue).set({ status: "cancelled", updatedAt: new Date() }).where(eq(queue.id, id));
}

/** Pending entries for dates SquashCity already takes bookings for. */
export async function getProcessableEntries() {
  const lastOpenDate = addDaysISO(getCurrentDateISO(), BOOKING_HORIZON_DAYS);
  return db
    .select()
    .from(queue)
    .where(and(eq(queue.status, "pending"), lte(queue.date, lastOpenDate)));
}

export async function setQueueStatus(id: number, status: string) {
  await db.update(queue).set({ status, updatedAt: new Date() }).where(eq(queue.id, id));
}

export async function listRecentQueue() {
  return db.select().from(queue).orderBy(desc(queue.createdAt)).limit(50);
}

export async function expirePastEntries() {
  const today = getCurrentDateISO();
  const result = await db
    .update(queue)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(queue.status, "pending"), lt(queue.date, today)))
    .returning({ id: queue.id });
  if (result.length > 0) {
    logger.info("Queue: expired past entries", { expiredCount: result.length, expiredIds: result.map((r) => r.id) });
  }
}
