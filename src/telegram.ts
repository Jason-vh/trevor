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

function toChatMessage(ctx: Context, message: Message.TextMessage): ChatMessage {
  const replyTo = message.reply_to_message;

  return {
    chatId: String(message.chat.id),
    messageId: message.message_id,
    sender: senderName(message.from, ctx.me),
    text: message.text,
    sentAt: new Date(message.date * 1000),
    replyTo: replyTo ? { messageId: replyTo.message_id, sender: senderName(replyTo.from, ctx.me) } : undefined,
  };
}

/** Whether the message is clearly meant for Trevor: a private chat, an @mention, or a reply to him. */
function isAddressedToTrevor(ctx: Context, message: Message.TextMessage): boolean {
  if (message.chat.type === "private") return true;
  if (message.text.includes(`@${ctx.me.username}`)) return true;
  return message.reply_to_message?.from?.id === ctx.me.id;
}

/**
 * Trevor answers in the background. If that breaks on a message meant for him, say so in the chat
 * rather than going quiet. Other messages most likely needed no answer anyway.
 */
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

    // Trevor sees every message, and decides himself whether it asks something of him.
    const message = ctx.message;
    const submission = await trevor.receive(toChatMessage(ctx, message));
    logger.info("Telegram: message received", { chatId, messageId: message.message_id });

    if (isAddressedToTrevor(ctx, message)) {
      reportFailure(bot, submission, chatId);
    }
  });
}
