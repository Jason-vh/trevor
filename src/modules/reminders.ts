import type { Bot } from "grammy";

import { getMetadata, setMetadata } from "@/modules/metadata";
import { getSession } from "@/modules/session-manager";
import { getAllSlotsOnDate } from "@/modules/slots";
import { config } from "@/utils/config";
import { getCurrentDateISO, getCurrentTime } from "@/utils/datetime";
import { logger } from "@/utils/logger";
import { buildReminderMessage, shouldSendReminder } from "@/utils/reminders";

const REMINDER_SENT_KEY = "reminders_sent_date";

export async function sendDailyReminders(bot: Bot): Promise<void> {
  const today = getCurrentDateISO();
  const lastSent = await getMetadata(REMINDER_SENT_KEY);

  if (!shouldSendReminder(getCurrentTime(), today, lastSent?.value ?? null)) {
    return;
  }

  const session = await getSession();
  const slots = await getAllSlotsOnDate(session, new Date());
  const bookings = slots.filter((slot) => slot.isOwnBooking);

  await setMetadata(REMINDER_SENT_KEY, today);

  if (bookings.length === 0) {
    logger.info("Reminders: nothing booked today", { date: today });
    return;
  }

  const message = buildReminderMessage(bookings);

  for (const chatId of config.telegram.groupChatIds) {
    await bot.api
      .sendMessage(chatId, message)
      .catch((error) => logger.error("Reminders: failed to send", { chatId, error }));
  }

  logger.info("Reminders: sent", { date: today, bookingCount: bookings.length });
}
