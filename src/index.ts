import { Bot, webhookCallback } from "grammy";

import { runAgent } from "@/agent/agent";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";
import { desc, eq } from "drizzle-orm";

const bot = new Bot(config.telegram.token);

// Only respond to allowed chats. In groups, only respond when mentioned.
bot.on("message:text", async (ctx) => {
  const chatId = String(ctx.chat.id);

  if (!config.telegram.chatIds.has(chatId)) {
    logger.warn("Ignoring message from unauthorized chat", { chatId: ctx.chat.id });
    return;
  }

  const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
  let messageText = ctx.message.text;

  if (isGroup) {
    // In groups, only respond when the bot is @mentioned
    const botUsername = ctx.me.username;
    const mention = `@${botUsername}`;

    if (!messageText.includes(mention)) {
      return;
    }

    // Strip the @mention from the message
    messageText = messageText.replaceAll(mention, "").trim();

    if (!messageText) {
      await ctx.reply("Yes? What can I do for you?", { reply_parameters: { message_id: ctx.message.message_id } });
      return;
    }
  }

  logger.info("Received message", {
    chatId,
    textLength: messageText.length,
    isGroup,
  });

  const elapsed = logger.time();

  try {
    const response = await runAgent(chatId, messageText);
    const replyOptions = isGroup
      ? { parse_mode: "HTML" as const, reply_parameters: { message_id: ctx.message.message_id } }
      : { parse_mode: "HTML" as const };
    await ctx.reply(response, replyOptions);
    logger.info("Message handled", { chatId, isGroup, latencyMs: elapsed() });
  } catch (error) {
    logger.error("Error processing message", { chatId, isGroup, latencyMs: elapsed(), error });
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

async function main() {
  if (config.webhook) {
    // Production: webhook mode via Bun.serve
    const { domain, secret } = config.webhook;
    const handleUpdate = webhookCallback(bot, "bun", { secretToken: secret });

    const server = Bun.serve({
      port: Number(Bun.env.PORT) || 3000,
      async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/health") {
          return new Response("OK");
        }

        if (url.pathname === "/webhook" && req.method === "POST") {
          // Grammy's Bun adapter expects a slightly different Request type
          return handleUpdate(req as unknown as Parameters<typeof handleUpdate>[0]);
        }

        if (url.pathname === "/history" && req.method === "GET") {
          if (req.headers.get("Authorization") !== `Bearer ${secret}`) {
            return new Response("Unauthorized", { status: 401 });
          }
          const chatId = url.searchParams.get("chat_id");
          if (!chatId) return new Response("Missing chat_id", { status: 400 });
          const rows = await db
            .select({ role: messages.role, content: messages.content, createdAt: messages.createdAt })
            .from(messages)
            .where(eq(messages.chatId, chatId))
            .orderBy(desc(messages.createdAt))
            .limit(20);
          return new Response(JSON.stringify(rows.reverse()), {
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response("Not found", { status: 404 });
      },
    });

    await bot.api.setWebhook(`https://${domain}/webhook`, {
      secret_token: secret,
    });

    logger.info(`Webhook set: https://${domain}/webhook`);
    logger.info(`Server listening on port ${server.port}`);

    const shutdown = () => {
      server.stop();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } else {
    // Development: long polling mode
    logger.info("Starting bot in long-polling mode");

    const shutdown = () => {
      bot.stop();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    bot.start();
  }

  logger.info("Trevor is running!");
}

main().catch((error) => {
  logger.error("Fatal error", { error });
  process.exit(1);
});
