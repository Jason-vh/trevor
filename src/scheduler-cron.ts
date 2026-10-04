import { Cron } from "croner";
import type { Bot } from "grammy";

import type { Trevor } from "@/agent/trevor";
import { setMetadata } from "@/modules/metadata";
import { queueUpcomingWeeks } from "@/modules/recurring";
import { sendDailyReminders } from "@/modules/reminders";
import { processQueue } from "@/modules/scheduler";
import { APP_TIME_ZONE } from "@/utils/datetime";
import { logger } from "@/utils/logger";

const SCHEDULE = "*/5 * * * *";

async function runTick(bot: Bot, trevor: Trevor) {
  try {
    await queueUpcomingWeeks();
    await processQueue(bot, trevor);
    await setMetadata("last_cron_run", new Date().toISOString());
  } catch (error) {
    logger.error("Cron: queue run failed (will retry on next schedule)", { error });
  }

  await sendDailyReminders(trevor).catch((error) => logger.error("Cron: reminders failed", { error }));
  logger.info("Cron: done");
}

export function startCron(bot: Bot, trevor: Trevor) {
  const job = new Cron(
    SCHEDULE,
    { protect: true, timezone: APP_TIME_ZONE, catch: (error) => logger.error("Cron: tick failed", { error }) },
    () => runTick(bot, trevor),
  );
  logger.info("Cron scheduled", { schedule: SCHEDULE, next: job.nextRun() });
  return job;
}
