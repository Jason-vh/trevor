import type { Bot } from "grammy";

import type { Trevor } from "@/agent/trevor";
import { bookSlot } from "@/modules/booking";
import { getBookingOrigins, recordBookingOrigin } from "@/modules/booking-origins";
import { confirmEvent, createConfirmedEvent } from "@/modules/calendar";
import { getCourtTiers } from "@/modules/court-preferences";
import { expirePastEntries, getProcessableEntries, resetStaleProcessingEntries, setQueueStatus } from "@/modules/queue";
import { getSession } from "@/modules/session-manager";
import { filterByTimeRange, getAllSlotsOnDate } from "@/modules/slots";
import type { CourtAvailability } from "@/types";
import { slotKey, sortSlotsByPreference } from "@/utils/courts";
import { logger } from "@/utils/logger";

function buildBookedMessage(slot: CourtAvailability): string {
  return `✅ A court opened up, so I booked it!\n\n🏸 ${slot.courtName}\n🗓️ ${slot.formattedDate}\n🕐 ${slot.formattedStartTime}`;
}

type QueueEntry = Awaited<ReturnType<typeof getProcessableEntries>>[number];

async function announceBooking(bot: Bot, trevor: Trevor, entry: QueueEntry, slot: CourtAvailability) {
  try {
    if (entry.calendarEventId) {
      await confirmEvent(entry.calendarEventId, slot.courtName, slot.dateISO, slot.formattedStartTime);
    } else {
      await createConfirmedEvent(slot.courtName, slot.dateISO, slot.formattedStartTime);
    }
  } catch (error) {
    logger.warn("Queue: calendar update failed", { id: entry.id, error });
  }

  try {
    const message = buildBookedMessage(slot);
    await bot.api.sendMessage(entry.chatId, message);
    await trevor.notice(entry.chatId, `The booking queue booked a court, and this was sent to the chat:\n${message}`);
  } catch (error) {
    logger.error("Queue: failed to announce booking", { id: entry.id, chatId: entry.chatId, error });
  }
}

/** A court we already hold in the entry's window, booked for this chat or by hand on the website. */
function findExistingBooking(entry: QueueEntry, slots: CourtAvailability[], origins: Map<string, string>) {
  return slots.find((slot) => {
    if (!slot.isOwnBooking) return false;
    const origin = origins.get(slotKey(slot.formattedStartTime, slot.courtName));
    return origin === undefined || origin === entry.chatId;
  });
}

export async function processQueue(bot: Bot, trevor: Trevor): Promise<void> {
  const elapsed = logger.time();

  await resetStaleProcessingEntries();
  await expirePastEntries();

  const entries = await getProcessableEntries();

  if (entries.length === 0) {
    logger.info("Queue: no pending entries", { latencyMs: elapsed() });
    return;
  }

  logger.info("Queue: starting run", { entryCount: entries.length });

  const session = await getSession();
  const courtTiers = await getCourtTiers();

  let booked = 0;
  let alreadyBooked = 0;
  let failed = 0;
  let noSlots = 0;

  for (const entry of entries) {
    await setQueueStatus(entry.id, "processing");

    try {
      const dateObj = new Date(entry.date + "T12:00:00");
      const allSlots = await getAllSlotsOnDate(session, dateObj);
      const filtered = filterByTimeRange(allSlots, entry.timeFrom, entry.timeTo);

      const origins = await getBookingOrigins(entry.date);
      const existing = findExistingBooking(entry, filtered, origins);
      if (existing) {
        await setQueueStatus(entry.id, "booked");
        // A court booked on the website has no chat yet; it does now, so it gets its reminder.
        if (!origins.has(slotKey(existing.formattedStartTime, existing.courtName))) {
          await recordBookingOrigin(entry.chatId, existing);
        }
        logger.info("Queue: already have a court in this window", {
          id: entry.id,
          date: entry.date,
          court: existing.courtName,
          time: existing.formattedStartTime,
        });
        alreadyBooked++;
        continue;
      }
      const available = sortSlotsByPreference(
        filtered.filter((s) => s.isAvailable),
        courtTiers,
      );

      if (available.length === 0) {
        logger.info("Queue: no available slots for entry", {
          id: entry.id,
          date: entry.date,
          timeFrom: entry.timeFrom,
          timeTo: entry.timeTo,
          // 0 means SquashCity hasn't opened the day yet
          slotsOnDay: allSlots.length,
        });
        await setQueueStatus(entry.id, "pending");
        noSlots++;
        continue;
      }

      const result = await bookSlot(available[0], session);

      if (result.success) {
        await setQueueStatus(entry.id, "booked");
        logger.info("Queue: entry booked", {
          id: entry.id,
          date: entry.date,
          chatId: entry.chatId,
          reservationId: result.reservationId,
        });
        booked++;
        // The court is booked: nothing after this may put the entry back in the queue.
        await recordBookingOrigin(entry.chatId, result.slot);
        await announceBooking(bot, trevor, entry, result.slot);
      } else {
        await setQueueStatus(entry.id, "pending");
        logger.warn("Queue: booking failed for entry", { id: entry.id, date: entry.date, error: result.error });
        failed++;
      }
    } catch (error) {
      await setQueueStatus(entry.id, "pending");
      logger.error("Queue: error processing entry", { id: entry.id, date: entry.date, error });
      failed++;
    }
  }

  logger.info("Queue: run complete", {
    entryCount: entries.length,
    booked,
    alreadyBooked,
    noSlots,
    failed,
    latencyMs: elapsed(),
  });
}
