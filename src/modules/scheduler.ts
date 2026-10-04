import type { Bot } from "grammy";

import type { Trevor } from "@/agent/trevor";
import { bookSlot } from "@/modules/booking";
import { confirmEvent, createConfirmedEvent } from "@/modules/calendar";
import { getCourtTiers } from "@/modules/court-preferences";
import { expirePastEntries, getProcessableEntries, resetStaleProcessingEntries, setQueueStatus } from "@/modules/queue";
import { getSession } from "@/modules/session-manager";
import { filterByTimeRange, getAllSlotsOnDate } from "@/modules/slots";
import type { CourtAvailability } from "@/types";
import { sortSlotsByPreference } from "@/utils/courts";
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
  let failed = 0;
  let noSlots = 0;

  for (const entry of entries) {
    await setQueueStatus(entry.id, "processing");

    try {
      const dateObj = new Date(entry.date + "T12:00:00");
      const allSlots = await getAllSlotsOnDate(session, dateObj);
      const filtered = filterByTimeRange(allSlots, entry.timeFrom, entry.timeTo);
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
    noSlots,
    failed,
    latencyMs: elapsed(),
  });
}
