import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { calendarEvents } from "@/db/schema";
import { composeInvite, INVITE_SENDER, type CalendarEvent } from "@/modules/calendar-invite";
import { FastmailSender, MaybeSentError } from "@/modules/fastmail";
import { config } from "@/utils/config";
import { addMinutesToTime } from "@/utils/datetime";
import { logger } from "@/utils/logger";

const BOOKING_MINUTES = 45;

const sender = config.fastmailBaseUrl ? new FastmailSender(config.fastmailBaseUrl, INVITE_SENDER.email) : null;
let syncing: Promise<void> = Promise.resolve();

async function deliver(event: CalendarEvent) {
  const message = await composeInvite(event);
  if (!sender) {
    logger.info("Calendar: invite not sent (no FASTMAIL_BASE_URL)", { message: message.toString() });
    return;
  }
  try {
    await sender.send(message);
  } catch (error) {
    if (!(error instanceof MaybeSentError)) throw error;
    // Counted as sent: sending it again could give everyone the same email twice.
    logger.warn("Calendar: invite may not have gone out", { id: event.id, error });
  }
}

async function sendPendingInvites() {
  const pending = await db
    .select()
    .from(calendarEvents)
    .where(or(isNull(calendarEvents.sentSequence), lt(calendarEvents.sentSequence, calendarEvents.sequence)));

  for (const event of pending) {
    try {
      await deliver(event);
      await db.update(calendarEvents).set({ sentSequence: event.sequence }).where(eq(calendarEvents.id, event.id));
      logger.info("Calendar: invite sent", { id: event.id, sequence: event.sequence, court: event.court });
    } catch (error) {
      logger.warn("Calendar: invite failed, retrying on the next run", { id: event.id, error });
    }
  }
}

/** Emails every change that hasn't gone out yet; runs one at a time, so nothing is sent twice. */
export function syncCalendar(): Promise<void> {
  syncing = syncing.then(sendPendingInvites).catch((error) => logger.error("Calendar: sync failed", { error }));
  return syncing;
}

function placeholderIdOf(calendarEventId: string | null): number | null {
  // Entries queued before invites came from Trevor hold a Google Calendar id instead.
  if (!calendarEventId || !/^\d+$/.test(calendarEventId)) return null;
  return Number(calendarEventId);
}

async function findActivePlaceholder(calendarEventId: string | null) {
  const id = placeholderIdOf(calendarEventId);
  if (id === null) return undefined;
  const [placeholder] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), isNull(calendarEvents.court), isNull(calendarEvents.cancelledAt)));
  return placeholder;
}

async function cancel(event: CalendarEvent) {
  await db
    .update(calendarEvents)
    .set({ sequence: event.sequence + 1, cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(calendarEvents.id, event.id));
}

/** Invites everyone to a placeholder for a queued request; returns its id, for `queue.calendarEventId`. */
export async function createPlaceholder(date: string, timeFrom: string, timeTo: string): Promise<string> {
  const [event] = await db.insert(calendarEvents).values({ date, timeFrom, timeTo }).returning();
  await syncCalendar();
  return String(event.id);
}

/**
 * Puts a booked court in everyone's calendar, turning the request's placeholder into it if there is one.
 * A court that's already in the calendar only has its placeholder withdrawn.
 */
export async function confirmBooking(booking: {
  calendarEventId: string | null;
  courtName: string;
  date: string;
  time: string;
}): Promise<void> {
  const placeholder = await findActivePlaceholder(booking.calendarEventId);
  const [existing] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.date, booking.date),
        eq(calendarEvents.timeFrom, booking.time),
        eq(calendarEvents.court, booking.courtName),
        isNull(calendarEvents.cancelledAt),
      ),
    );
  const court = {
    court: booking.courtName,
    timeFrom: booking.time,
    timeTo: addMinutesToTime(booking.time, BOOKING_MINUTES),
  };

  if (existing) {
    if (placeholder) await cancel(placeholder);
  } else if (placeholder) {
    await db
      .update(calendarEvents)
      .set({ ...court, sequence: placeholder.sequence + 1, updatedAt: new Date() })
      .where(eq(calendarEvents.id, placeholder.id));
  } else {
    await db.insert(calendarEvents).values({ ...court, date: booking.date });
  }
  await syncCalendar();
}

/** Withdraws the placeholders of queued requests that won't be booked after all. */
export async function cancelPlaceholders(calendarEventIds: (string | null)[]): Promise<void> {
  for (const calendarEventId of calendarEventIds) {
    const placeholder = await findActivePlaceholder(calendarEventId);
    if (placeholder) await cancel(placeholder);
  }
  await syncCalendar();
}

/** Cancels the booked courts starting at `time` on `date`. */
export async function cancelBooking(date: string, time: string): Promise<void> {
  const booked = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.date, date),
        eq(calendarEvents.timeFrom, time),
        isNotNull(calendarEvents.court),
        isNull(calendarEvents.cancelledAt),
      ),
    );
  for (const event of booked) await cancel(event);
  await syncCalendar();
}
