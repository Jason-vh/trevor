import { Bot } from "grammy";
import { Cron } from "croner";

import { setMetadata } from "@/modules/metadata";
import { processQueue } from "@/modules/scheduler";
import { logger } from "@/utils/logger";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

async function runTick(bot: Bot) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await processQueue(bot);
      await setMetadata("last_cron_run", new Date().toISOString()).catch((err) =>
        logger.warn("Cron: failed to record last run", { error: err }),
      );
      logger.info("Cron: done");
      return;
    } catch (error) {
      const isConnectError =
        error instanceof Error &&
        ("cause" in error && error.cause instanceof Error && "code" in error.cause
          ? error.cause.code === "CONNECT_TIMEOUT"
          : error.message.includes("CONNECT_TIMEOUT"));

      if (isConnectError && attempt < MAX_RETRIES) {
        logger.warn("Cron: DB connection timeout, retrying", {
          attempt,
          maxRetries: MAX_RETRIES,
        });
        await Bun.sleep(RETRY_DELAY_MS);
        continue;
      }

      logger.error("Cron: error during tick (will retry on next schedule)", {
        error,
        attempt,
      });
      return;
    }
  }
}

export function startCron(bot: Bot) {
  const job = new Cron("*/5 * * * *", { protect: true }, () => runTick(bot));
  logger.info("Cron scheduled", { schedule: "*/5 * * * *", next: job.nextRun() });
  return job;
}
