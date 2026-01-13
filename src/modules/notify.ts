import type { CourtAvailability } from "@/types";
import { sendTelegramMessage } from "@/telegram/bot";
import { logger } from "@/utils/logger";

export function buildMessage(
  groupedByDate: Map<string, Map<string, CourtAvailability[]>>,
  heading = "Hello! I've found some newly available squash courts:",
): string {
  let message = `${heading}\n\n`;
  for (const [date, slotsForDate] of groupedByDate) {
    message += `🗓️ *${date}*\n`;

    for (const [time, slotsForTime] of slotsForDate) {
      message += `- ${time}: ${slotsForTime.map((slot) => slot.courtName).join(", ")}\n`;
    }

    message += "\n";
  }

  return message;
}

export async function notify(chatId: string, groupedByDate: Map<string, Map<string, CourtAvailability[]>>, heading?: string) {
  const message = buildMessage(groupedByDate, heading);

  try {
    await sendTelegramMessage(chatId, message, { parseMode: "Markdown" });
    logger.info("Availability message sent to Telegram", { chatId, heading });
  } catch (error) {
    logger.error("Failed to send availability message", { error, chatId });
  }
}
