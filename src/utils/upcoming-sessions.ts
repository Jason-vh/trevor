import { daysBetween, getWeekdayDates, type Weekday } from "@/utils/datetime";

export type UpcomingSession = {
  date: string;
  timeFrom: string;
  timeTo: string;
  court: string | null;
  status: "booked" | "queued" | "weekly";
};

type WeeklyRule = { id: number; weekday: string; timeFrom: string; timeTo: string };

/**
 * The weeks of each weekly booking from `from` to `until` that haven't been queued yet. A week that was
 * queued, whatever became of it, is the queue's to show, so a removed week stays skipped.
 */
export function projectWeeklySessions(
  rules: WeeklyRule[],
  queuedDatesByRule: Map<number, Set<string>>,
  from: string,
  until: string,
): UpcomingSession[] {
  return rules.flatMap((rule) => {
    const queuedDates = queuedDatesByRule.get(rule.id) ?? new Set<string>();
    return getWeekdayDates(rule.weekday as Weekday, from, daysBetween(from, until))
      .filter((date) => !queuedDates.has(date))
      .map((date) => ({ date, timeFrom: rule.timeFrom, timeTo: rule.timeTo, court: null, status: "weekly" as const }));
  });
}
