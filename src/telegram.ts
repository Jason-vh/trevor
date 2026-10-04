import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Submission } from "@earendil-works/pi-durable";
import type { Bot, Context } from "grammy";
import type { Message, User } from "grammy/types";

import type { ChatMessage } from "@/agent/messages";
import type { Trevor } from "@/agent/trevor";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

// Reasons a message can go unanswered because something broke, rather than because it was withdrawn.
const FAILURE_REASONS = new Set(["model_error", "faulted", "no_model"]);

function senderName(user: User | undefined, me: User): string {
  if (!user) return "someone";
  if (user.id === me.id) return "Trevor";
  return [user.first_name, user.last_name].filter(Boolean).join(" ");
}

function toChatMessage(ctx: Context, message: Message, text: string): ChatMessage {
  const replyTo = message.reply_to_message;

  return {
    chatId: String(message.chat.id),
    messageId: message.message_id,
    sender: senderName(message.from, ctx.me),
    text,
    sentAt: new Date(message.date * 1000),
    replyTo: replyTo ? { messageId: replyTo.message_id, sender: senderName(replyTo.from, ctx.me) } : undefined,
  };
}

/** Trevor answers in the background; if that breaks, say so in the chat rather than going quiet. */
function reportFailure(bot: Bot, submission: Submission, chatId: string) {
  submission
    .wait(BACKGROUND_CONTEXT)
    .then(async (settled) => {
      if (settled.status !== "unanswered" || !FAILURE_REASONS.has(settled.reason)) return;
      logger.error("Telegram: message went unanswered", { chatId, reason: settled.reason, detail: settled.detail });
      await bot.api.sendMessage(chatId, "Sorry, something went wrong. Please try again.");
    })
    .catch((error) => logger.error("Telegram: failed to report an unanswered message", { chatId, error }));
}

export function handleMessages(bot: Bot, trevor: Trevor) {
  bot.on("message:text", async (ctx) => {
    const chatId = String(ctx.chat.id);

    if (!config.telegram.chatIds.has(chatId)) {
      logger.warn("Telegram: ignoring message from unauthorized chat", { chatId });
      return;
    }

    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
    let text = ctx.message.text;

    if (isGroup) {
      // In groups, only respond when the bot is @mentioned
      const mention = `@${ctx.me.username}`;
      if (!text.includes(mention)) return;
      text = text.replaceAll(mention, "").trim();
    }

    const submission = await trevor.receive(toChatMessage(ctx, ctx.message, text));
    logger.info("Telegram: message received", { chatId, isGroup, messageId: ctx.message.message_id });
    reportFailure(bot, submission, chatId);
  });
}
