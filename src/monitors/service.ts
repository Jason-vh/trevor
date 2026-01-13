import { nanoid } from "nanoid";

import type { CourtAvailability, ISODate, MonitorWindow, Weekday } from "@/types";
import { getUpcomingDatesForWeekdays, isPastISODate, normalizeISODate } from "@/utils/datetime";
import { logger } from "@/utils/logger";

import { readMonitors, writeMonitors } from "./store";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface MonitorInput {
  chatId: string;
  fromTime: string;
  toTime: string;
  dates?: ISODate[];
  daysOfWeek?: Weekday[];
  description?: string;
}

function validateTime(label: string, value: string): void {
  if (!TIME_REGEX.test(value)) {
    throw new Error(`${label} must be in HH:MM format`);
  }
}

function sanitizeDates(dates?: ISODate[]): ISODate[] | undefined {
  if (!dates || dates.length === 0) {
    return undefined;
  }

  const normalized = dates.map(normalizeISODate);
  return Array.from(new Set(normalized));
}

export async function listMonitors(): Promise<MonitorWindow[]> {
  return readMonitors();
}

export async function listMonitorsForChat(
  chatId: string,
  options?: { includeInactive?: boolean },
): Promise<MonitorWindow[]> {
  const monitors = await readMonitors();
  return monitors.filter((monitor) => monitor.chatId === chatId && (options?.includeInactive || monitor.active));
}

export async function saveMonitor(updatedMonitor: MonitorWindow): Promise<void> {
  const monitors = await readMonitors();
  const index = monitors.findIndex((monitor) => monitor.id === updatedMonitor.id);

  if (index === -1) {
    throw new Error(`Monitor ${updatedMonitor.id} not found`);
  }

  monitors[index] = updatedMonitor;
  await writeMonitors(monitors);
}

export async function createMonitor(input: MonitorInput): Promise<MonitorWindow> {
  validateTime("fromTime", input.fromTime);
  validateTime("toTime", input.toTime);

  const dates = sanitizeDates(input.dates);

  if (!dates?.length && !input.daysOfWeek?.length) {
    throw new Error("At least one date or weekday is required to create a monitor");
  }

  const now = new Date().toISOString();
  const monitor: MonitorWindow = {
    id: nanoid(10),
    chatId: input.chatId,
    fromTime: input.fromTime,
    toTime: input.toTime,
    dates,
    daysOfWeek: input.daysOfWeek,
    description: input.description,
    createdAt: now,
    updatedAt: now,
    active: true,
    lastNotified: {},
  };

  const monitors = await readMonitors();
  monitors.push(monitor);
  await writeMonitors(monitors);

  logger.info("Monitor created", { monitor });

  return monitor;
}

export function slotKey(slot: CourtAvailability): string {
  return `${slot.courtId}:${slot.formattedDate}:${slot.formattedStartTime}`;
}

export function summarizeMonitor(monitor: MonitorWindow): string {
  const { fromTime, toTime, description } = monitor;
  const chunks: string[] = [];

  if (monitor.daysOfWeek?.length) {
    chunks.push(`weekdays: ${monitor.daysOfWeek.join(", ")}`);
  }

  if (monitor.dates?.length) {
    chunks.push(`dates: ${monitor.dates.join(", ")}`);
  }

  const scope = chunks.join(" | ") || "custom dates";
  const label = description ? ` – ${description}` : "";

  return `[${monitor.id}] ${fromTime}-${toTime} (${scope})${label}`;
}

export function getMonitorTargetDates(monitor: MonitorWindow, lookaheadDays: number): ISODate[] {
  const upcomingFromWeekdays =
    monitor.daysOfWeek && monitor.daysOfWeek.length > 0 ? getUpcomingDatesForWeekdays(monitor.daysOfWeek, lookaheadDays) : [];

  const explicitDates = monitor.dates?.filter((date) => !isPastISODate(date)) ?? [];

  return Array.from(new Set([...explicitDates, ...upcomingFromWeekdays]));
}

export function pruneExpiredDates(monitor: MonitorWindow): MonitorWindow {
  if (!monitor.dates?.length) {
    return monitor;
  }

  const filteredDates = monitor.dates.filter((date) => !isPastISODate(date));

  if (filteredDates.length === monitor.dates.length) {
    return monitor;
  }

  return {
    ...monitor,
    dates: filteredDates,
  };
}

export async function deactivateMonitor(monitorId: string): Promise<void> {
  const monitors = await readMonitors();
  const index = monitors.findIndex((monitor) => monitor.id === monitorId);

  if (index === -1) {
    return;
  }

  monitors[index] = {
    ...monitors[index],
    active: false,
    updatedAt: new Date().toISOString(),
  };

  await writeMonitors(monitors);
}

export function updateLastNotified(monitor: MonitorWindow, isoDate: string, slotKeys: string[]): MonitorWindow {
  const lastNotified = monitor.lastNotified ?? {};
  return {
    ...monitor,
    lastNotified: {
      ...lastNotified,
      [isoDate]: slotKeys,
    },
    updatedAt: new Date().toISOString(),
  };
}
