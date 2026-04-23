import type { Weekday } from "@/types";

export const APP_TIME_ZONE = "Europe/Amsterdam";

export function formatDateISO(date: Date, timeZone: string = APP_TIME_ZONE): string {
  return date.toLocaleDateString("sv-SE", { timeZone });
}

export function getCurrentDateISO(timeZone: string = APP_TIME_ZONE, now: Date = new Date()): string {
  return formatDateISO(now, timeZone);
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

export function getNextDays(count: number): { day: Weekday; date: Date }[] {
  const days: { day: Weekday; date: Date }[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);

    const day = date.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase() as Weekday;
    days.push({ day, date });
  }

  return days;
}
