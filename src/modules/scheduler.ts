import type { Bot } from "grammy";

import { bookSlot } from "@/modules/booking";
import { buildBookingMessage } from "@/modules/notify";
import { expirePastEntries, getProcessableEntries, setQueueStatus } from "@/modules/queue";
import { getSession } from "@/modules/session-manager";
import { filterByTimeRange, getAllSlotsOnDate } from "@/modules/slots";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

export async function processQueue(bot: Bot): Promise<void> {
  const elapsed = logger.time();

  await expirePastEntries();

  const entries = await getProcessableEntries();

  if (entries.length === 0) {
    logger.info("Queue: no pending entries", { latencyMs: elapsed() });
    return;
  }

  logger.info("Queue: starting run", { entryCount: entries.length });

  const session = await getSession();

  let booked = 0;
  let failed = 0;
  let noSlots = 0;

  for (const entry of entries) {
    await setQueueStatus(entry.id, "processing");

    try {
      const dateObj = new Date(entry.date + "T12:00:00");
      const allSlots = await getAllSlotsOnDate(session, dateObj);
      const filtered = filterByTimeRange(allSlots, entry.timeFrom, entry.timeTo);
      const available = filtered.filter((s) => s.isAvailable);

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
        const message = buildBookingMessage(result);
        for (const chatId of config.telegram.chatIds) {
          await bot.api.sendMessage(chatId, message, {
            parse_mode: "Markdown",
          });
        }
        logger.info("Queue: entry booked", { id: entry.id, date: entry.date, reservationId: result.reservationId });
        booked++;
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
