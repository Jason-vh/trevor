import { Bot } from "grammy";

import type { BookingResult, CourtAvailability } from "@/types";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

export function buildMessage(groupedByDate: Map<string, Map<string, CourtAvailability[]>>): string {
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

export function buildBookingMessage(result: BookingResult): string {
  const { slot } = result;

  if (result.success) {
    let message = `✅ *Court booked!*\n\n`;
    message += `🏸 ${slot.courtName}\n`;
    message += `🗓️ ${slot.formattedDate}\n`;
    message += `🕐 ${slot.formattedStartTime}\n`;
    if (result.reservationId) {
      message += `\nReservation ID: ${result.reservationId}`;
    }
    return message;
  }

  let message = `❌ *Booking failed*\n\n`;
  message += `🏸 ${slot.courtName}\n`;
  message += `🗓️ ${slot.formattedDate}\n`;
  message += `🕐 ${slot.formattedStartTime}\n`;
  message += `\nError: ${result.error}`;
  return message;
}

export async function notify(message: string): Promise<void> {
  const bot = new Bot(config.telegram.token);

  try {
    for (const chatId of config.telegram.chatIds) {
      await bot.api.sendMessage(chatId, message, {
        parse_mode: "Markdown",
      });
    }

    logger.info("Message sent to Telegram", { message });
  } catch (error) {
    logger.error("Failed to send Telegram message", { error, message });
  }
}
