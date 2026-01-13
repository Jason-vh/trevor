import type { Weekday } from "@/types";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

export function toISODate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export function isISODate(value: string): boolean {
  return ISO_DATE_REGEX.test(value);
}

export function normalizeISODate(value: string): string {
  if (!isISODate(value)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return value;
}

export function getUpcomingDatesForWeekdays(days: Weekday[], lookaheadDays: number): string[] {
  const upcoming: string[] = [];
  const now = new Date();

  for (let i = 0; i < lookaheadDays; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase() as Weekday;

    if (days.includes(weekday)) {
      upcoming.push(toISODate(date));
    }
  }

  return upcoming;
}

export function parseISODate(value: string): Date {
  const normalized = normalizeISODate(value);
  const date = new Date(`${normalized}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unable to parse ISO date: ${value}`);
  }

  return date;
}

export function isPastISODate(value: string): boolean {
  const date = parseISODate(value);
  const now = new Date();
  date.setHours(23, 59, 59, 999);
  return date.getTime() < now.getTime();
}
