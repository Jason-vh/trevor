export const APP_TIME_ZONE = "Europe/Amsterdam";

export function formatDateISO(date: Date, timeZone: string = APP_TIME_ZONE): string {
  return date.toLocaleDateString("sv-SE", { timeZone });
}

export function getCurrentDateISO(timeZone: string = APP_TIME_ZONE, now: Date = new Date()): string {
  return formatDateISO(now, timeZone);
}

export function getCurrentTime(timeZone: string = APP_TIME_ZONE, now: Date = new Date()): string {
  return now.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
}

export function getTimeInMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getNextDays(count: number): Date[] {
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date;
  });
}

/** e.g. "Tue 21 Jul 2026 18:05" */
export function formatMessageTime(date: Date, timeZone: string = APP_TIME_ZONE): string {
  const day = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
  return `${day.replace(",", "")} ${getCurrentTime(timeZone, date)}`;
}

/** Minutes from `now` until `time` on `dateISO`, both in `timeZone`. Negative once it has started. */
export function getMinutesUntil(
  dateISO: string,
  time: string,
  now: Date = new Date(),
  timeZone: string = APP_TIME_ZONE,
): number {
  const days = (Date.parse(dateISO) - Date.parse(getCurrentDateISO(timeZone, now))) / 86_400_000;
  return days * 24 * 60 + getTimeInMinutes(time) - getTimeInMinutes(getCurrentTime(timeZone, now));
}

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function addDaysISO(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getWeekday(dateISO: string): Weekday {
  return WEEKDAYS[new Date(`${dateISO}T00:00:00Z`).getUTCDay()];
}

export function lastDayOfMonth(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, untilISO: string): number {
  return Math.round((Date.parse(untilISO) - Date.parse(fromISO)) / 86_400_000);
}

/** The dates falling on `weekday` from `fromISO` up to and including `days` days later. */
export function getWeekdayDates(weekday: Weekday, fromISO: string, days: number): string[] {
  return Array.from({ length: days + 1 }, (_, offset) => addDaysISO(fromISO, offset)).filter(
    (dateISO) => getWeekday(dateISO) === weekday,
  );
}

/** "HH:MM" `minutes` later, e.g. 18:30 + 45 → "19:15". */
export function addMinutesToTime(time: string, minutes: number): string {
  const total = getTimeInMinutes(time) + minutes;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

function timeZoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((each) => each.type === type)?.value);
  const wallClock = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallClock - (instant - (instant % 1000));
}

/** The instant at which `time` on `dateISO` happens in `timeZone`. */
export function zonedTimeToUtc(dateISO: string, time: string, timeZone: string = APP_TIME_ZONE): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes);
  const guess = wallClock - timeZoneOffset(wallClock, timeZone);
  return new Date(wallClock - timeZoneOffset(guess, timeZone));
}
