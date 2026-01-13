import { Bot } from "grammy";

import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

export const bot = new Bot(config.telegram.token);

export type TelegramChatId = string;

export function isAllowedChat(chatId: TelegramChatId): boolean {
  return config.telegram.allowedChatIds.includes(chatId);
}

export async function sendTelegramMessage(
  chatId: TelegramChatId,
  text: string,
  options?: { parseMode?: "Markdown" | "MarkdownV2" | "HTML" },
): Promise<void> {
  const numericChatId = Number(chatId);

  if (Number.isNaN(numericChatId)) {
    logger.error("Cannot send Telegram message due to invalid chat id", { chatId });
    return;
  }

  try {
    await bot.api.sendMessage(numericChatId, text, {
      parse_mode: options?.parseMode,
      link_preview_options: {
        is_disabled: true,
      },
    });
  } catch (error) {
    logger.error("Failed to send Telegram message", { chatId, error });
    throw error;
  }
}
