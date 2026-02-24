import { Bot } from "grammy";

import { processQueue } from "@/modules/scheduler";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

const bot = new Bot(config.telegram.token);

logger.info("Cron: starting queue processing");

try {
  await processQueue(bot);
  logger.info("Cron: done");
} catch (error) {
  logger.error("Cron: fatal error", { error });
  process.exit(1);
}

process.exit(0);
