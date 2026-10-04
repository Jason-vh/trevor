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
