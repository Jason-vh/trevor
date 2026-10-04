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

export function formatLongDate(date: Date, timeZone: string = APP_TIME_ZONE): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  });
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
