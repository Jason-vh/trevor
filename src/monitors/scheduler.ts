import { Cron } from "croner";

import { groupSlotsByDateAndTime } from "@/modules/slots";
import type { CourtAvailability, MonitorWindow, Session } from "@/types";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";
import { sendTelegramMessage } from "@/telegram/bot";
import { fetchAvailabilityForDates } from "@/services/availability";
import { login } from "@/modules/auth";
import { buildMessage } from "@/modules/notify";
import { mergeGroupedSlots } from "@/utils/slots";

import {
  deactivateMonitor,
  getMonitorTargetDates,
  listMonitors,
  pruneExpiredDates,
  saveMonitor,
  slotKey,
  updateLastNotified,
} from "./service";

async function processMonitor(monitor: MonitorWindow, session: Session, lookaheadDays: number) {
  let workingMonitor = pruneExpiredDates(monitor);
  let hasChanges = workingMonitor !== monitor;

  const targetDates = getMonitorTargetDates(workingMonitor, lookaheadDays);

  if (targetDates.length === 0) {
    if (!workingMonitor.daysOfWeek?.length) {
      await deactivateMonitor(workingMonitor.id);
      logger.info("Deactivated monitor with no remaining dates", { monitorId: workingMonitor.id });
    } else if (hasChanges) {
      workingMonitor = { ...workingMonitor, updatedAt: new Date().toISOString() };
      await saveMonitor(workingMonitor);
    }
    return;
  }

  const availability = await fetchAvailabilityForDates({
    dates: targetDates,
    fromTime: workingMonitor.fromTime,
    toTime: workingMonitor.toTime,
    session,
  });

  const aggregated = new Map<string, Map<string, CourtAvailability[]>>();
  let notificationsSent = false;

  for (const daily of availability) {
    const availableSlots = daily.slots.filter((slot) => slot.isAvailable);

    if (availableSlots.length === 0) {
      continue;
    }

    const knownKeys = workingMonitor.lastNotified?.[daily.isoDate] ?? [];
    const newSlots = availableSlots.filter((slot) => !knownKeys.includes(slotKey(slot)));

    if (newSlots.length === 0) {
      continue;
    }

    const groupedNewSlots = groupSlotsByDateAndTime(newSlots);
    mergeGroupedSlots(aggregated, groupedNewSlots);

    const mergedKeys = Array.from(new Set([...knownKeys, ...newSlots.map((slot) => slotKey(slot))]));
    workingMonitor = updateLastNotified(workingMonitor, daily.isoDate, mergedKeys);
    hasChanges = true;
    notificationsSent = true;
  }

  if (notificationsSent && aggregated.size > 0) {
    const heading = workingMonitor.description
      ? `Trevor found new squash courts for ${workingMonitor.description}`
      : "Trevor found new squash courts for one of your monitors";

    const message = buildMessage(aggregated, heading);
    await sendTelegramMessage(workingMonitor.chatId, message, { parseMode: "Markdown" });
    logger.info("Sent scheduled availability update", { monitorId: workingMonitor.id });
  }

  if (hasChanges) {
    workingMonitor = { ...workingMonitor, updatedAt: new Date().toISOString() };
    await saveMonitor(workingMonitor);
  }
}

async function runMonitorTick(): Promise<void> {
  const monitors = (await listMonitors()).filter((monitor) => monitor.active);

  if (monitors.length === 0) {
    return;
  }

  logger.debug("Running monitor tick", { monitors: monitors.length });

  const session = await login();

  for (const monitor of monitors) {
    try {
      await processMonitor(monitor, session, config.monitoring.lookaheadDays);
    } catch (error) {
      logger.error("Monitor run failed", { monitorId: monitor.id, error });
    }
  }
}

export function startMonitorScheduler() {
  const job = new Cron(
    config.monitoring.cronExpression,
    {
      timezone: config.monitoring.timezone,
    },
    async () => {
      try {
        await runMonitorTick();
      } catch (error) {
        logger.error("Monitor scheduler run failed", { error });
      }
    },
  );

  // kick off immediately for faster feedback in dev
  job.trigger();

  logger.info("Monitor scheduler started", {
    cron: config.monitoring.cronExpression,
    timezone: config.monitoring.timezone,
  });

  return job;
}
