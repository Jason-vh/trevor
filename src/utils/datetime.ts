import type { Weekday } from "@/types";

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
