import type { Bot } from "grammy";

import { bookSlot } from "@/modules/booking";
import { buildBookingMessage } from "@/modules/notify";
import { expirePastEntries, getProcessableEntries, setQueueStatus } from "@/modules/queue";
import { getSession } from "@/modules/session-manager";
import { filterByTimeRange, getAllSlotsOnDate } from "@/modules/slots";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

export async function processQueue(bot: Bot): Promise<void> {
  await expirePastEntries();

  const entries = await getProcessableEntries();
  if (entries.length === 0) return;

  logger.info(`Processing ${entries.length} queue entries`);

  const session = await getSession();

  for (const entry of entries) {
    await setQueueStatus(entry.id, "processing");

    try {
      const dateObj = new Date(entry.date + "T12:00:00");
      const allSlots = await getAllSlotsOnDate(session, dateObj);
      const filtered = filterByTimeRange(allSlots, entry.timeFrom, entry.timeTo);
      const available = filtered.filter((s) => s.isAvailable);

      if (available.length === 0) {
        await setQueueStatus(entry.id, "pending");
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
        logger.info(`Booked queue entry ${entry.id}`);
      } else {
        await setQueueStatus(entry.id, "pending");
        logger.warn(`Booking failed for entry ${entry.id}: ${result.error}`);
      }
    } catch (error) {
      await setQueueStatus(entry.id, "pending");
      logger.error(`Error processing entry ${entry.id}`, { error });
    }
  }
}
