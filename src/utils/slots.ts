import type { CourtAvailability } from "@/types";

export function mergeGroupedSlots(
  target: Map<string, Map<string, CourtAvailability[]>>,
  source: Map<string, Map<string, CourtAvailability[]>>,
) {
  for (const [date, timeMap] of source.entries()) {
    const existingDate = target.get(date);

    if (!existingDate) {
      target.set(date, new Map(timeMap));
      continue;
    }

    for (const [time, slots] of timeMap.entries()) {
      const existingSlots = existingDate.get(time);
      if (existingSlots) {
        existingSlots.push(...slots);
      } else {
        existingDate.set(time, [...slots]);
      }
    }
  }
}
