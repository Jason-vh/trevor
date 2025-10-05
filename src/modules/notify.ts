import { Bot } from "grammy";

import { filterAndGroupSlots } from "@/modules/slots";
import type { CourtAvailability } from "@/types";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

export function buildMessage(slots: CourtAvailability[], from: string, to: string): string {
  const groupedByDate = filterAndGroupSlots(slots, from, to);

  let message = "Hello! I've found some newly available squash courts:\n\n";
  for (const [date, slotsForDate] of groupedByDate) {
    message += `🗓️ *${date}*\n`;

    for (const [time, slotsForTime] of slotsForDate) {
      message += `- ${time}: ${slotsForTime.map((slot) => slot.courtName).join(", ")}\n`;
    }

    message += "\n";
  }

  return message;
}

export async function notify(message: string): Promise<void> {
  const bot = new Bot(config.telegram.token);

  try {
    await bot.api.sendMessage(config.telegram.chatId, message, {
      parse_mode: "Markdown",
    });

    logger.info("Message sent to Telegram", { message });
  } catch (error) {
    logger.error("Failed to send Telegram message", { error, message });
  }
}
