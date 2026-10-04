import { eq } from "drizzle-orm";

import { db } from "@/db";
import { bookingOrigins } from "@/db/schema";
import type { CourtAvailability } from "@/types";
import { slotKey } from "@/utils/courts";
import { logger } from "@/utils/logger";

/**
 * Remembers which chat a court was booked for. Best-effort: the court is booked either way, and a
 * failure here only costs that booking its reminder.
 */
export async function recordBookingOrigin(chatId: string, slot: CourtAvailability): Promise<void> {
  const origin = { date: slot.dateISO, time: slot.formattedStartTime, court: slot.courtName, chatId };

  try {
    await db
      .insert(bookingOrigins)
      .values(origin)
      .onConflictDoUpdate({
        target: [bookingOrigins.date, bookingOrigins.time, bookingOrigins.court],
        set: { chatId, createdAt: new Date() },
      });
  } catch (error) {
    logger.error("Booking origins: failed to record", { ...origin, error });
  }
}

/** The chat behind each court booked on `dateISO`, keyed by `slotKey`. */
export async function getBookingOrigins(dateISO: string): Promise<Map<string, string>> {
  const rows = await db.select().from(bookingOrigins).where(eq(bookingOrigins.date, dateISO));
  return new Map(rows.map((row) => [slotKey(row.time, row.court), row.chatId]));
}
