import { Bot } from "grammy";
import type { Update } from "@grammyjs/types";

import { startTrevor } from "@/agent/trevor";
import { closeDatabase, migrateDatabase } from "@/db";
import { getMetadata } from "@/modules/metadata";
import { listRecentQueue } from "@/modules/queue";
import { getUpcomingReservations } from "@/modules/reservations";
import { startCron } from "@/scheduler-cron";
import { handleMessages } from "@/telegram";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

const bot = new Bot(config.telegram.token);

const dashboardPath = new URL("./dashboard/index.html", import.meta.url).pathname;

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return new Response("OK");
  }

  if (url.pathname === "/") {
    return new Response(Bun.file(dashboardPath));
  }

  if (url.pathname === "/api/reservations" && req.method === "GET") {
    const reservations = await getUpcomingReservations();
    return Response.json(reservations);
  }

  if (url.pathname === "/api/queue" && req.method === "GET") {
    const entries = await listRecentQueue();
    return Response.json(entries);
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    const lastCronRun = await getMetadata("last_cron_run");
    return Response.json({ lastCronRun });
  }

  if (config.webhook) {
    const { secret } = config.webhook;

    if (url.pathname === "/webhook" && req.method === "POST") {
      if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
        return new Response("Unauthorized", { status: 401 });
      }
      // Answer only once the message is stored, so Telegram retries anything we failed to take in.
      const update = (await req.json()) as Update;
      try {
        await bot.handleUpdate(update);
      } catch (error) {
        logger.error("Error handling update", { error });
        return new Response("Error", { status: 500 });
      }
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Not found", { status: 404 });
}

async function main() {
  migrateDatabase();
  const trevor = await startTrevor(bot, config.conversationsPath);
  handleMessages(bot, trevor);

  const server = Bun.serve({
    port: Number(Bun.env.PORT) || 3000,
    fetch: handleRequest,
  });

  if (config.webhook) {
    const { domain, secret } = config.webhook;
    await bot.init();
    await bot.api.setWebhook(`https://${domain}/webhook`, {
      secret_token: secret,
    });
    logger.info(`Webhook set: https://${domain}/webhook`);
  } else {
    logger.info("Starting bot in long-polling mode");
    bot.catch((error) => logger.error("Error handling update", { error: error.error }));
    bot.start();
  }

  logger.info(`Server listening on port ${server.port}`);

  const cronJob = startCron(bot, trevor);

  const shutdown = async () => {
    cronJob.stop();
    await server.stop();
    if (!config.webhook) await bot.stop();
    await trevor.close();
    closeDatabase();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Trevor is running!");
}

main().catch((error) => {
  logger.error("Fatal error", { error });
  process.exit(1);
});
