import type { Update } from "grammy/types";

import { runAgent } from "@/agent";
import { startMonitorScheduler } from "@/monitors/scheduler";
import { bot, isAllowedChat } from "@/telegram/bot";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

const webhookPath = `/telegram/${config.telegram.webhookSecret}`;

bot.catch((err) => {
  logger.error("Telegram bot error", { error: err.error });
});

bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id.toString();

  if (!isAllowedChat(chatId)) {
    logger.warn("Received message from unauthorized chat", { chatId });
    return;
  }

  const text = ctx.message?.text;

  if (!text) {
    await ctx.reply("Send me a text message so I know what to do.");
    return;
  }

  await ctx.reply("Let me check that...");

  try {
    const response = await runAgent({
      chatId,
      message: text,
      username: ctx.from?.username ?? ctx.from?.first_name,
    });

    await ctx.reply(response);
  } catch (error) {
    logger.error("Failed to respond to Telegram message", { chatId, error });
    await ctx.reply("I ran into an issue, please try again shortly.");
  }
});

async function handleWebhook(request: Request): Promise<Response> {
  try {
    const update = (await request.json()) as Update;
    await bot.handleUpdate(update);
    return new Response("ok");
  } catch (error) {
    logger.error("Failed to process Telegram webhook", { error });
    return new Response("error", { status: 500 });
  }
}

function startServer() {
  const server = Bun.serve({
    port: config.server.port,
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/healthz") {
        return new Response("ok");
      }

      if (request.method === "POST" && url.pathname === webhookPath) {
        return await handleWebhook(request);
      }

      return new Response("Not found", { status: 404 });
    },
  });

  logger.info("Trevor server listening", { url: `http://localhost:${server.port}` });
}

async function bootstrap() {
  startMonitorScheduler();
  startServer();
}

bootstrap().catch((error) => {
  logger.error("Failed to start Trevor", { error });
  process.exit(1);
});
