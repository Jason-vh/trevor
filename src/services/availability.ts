import { login } from "@/modules/auth";
import { filterAndGroupSlots, getAllSlotsOnDate } from "@/modules/slots";
import type { CourtAvailability, Session } from "@/types";
import { parseISODate } from "@/utils/datetime";
import { logger } from "@/utils/logger";

export interface AvailabilityRequest {
  dates: string[];
  fromTime: string;
  toTime: string;
  session?: Session;
}

export interface DailyAvailability {
  isoDate: string;
  label: string;
  grouped: Map<string, Map<string, CourtAvailability[]>>;
  slots: CourtAvailability[];
}

export async function fetchAvailabilityForDates({
  dates,
  fromTime,
  toTime,
  session,
}: AvailabilityRequest): Promise<DailyAvailability[]> {
  if (dates.length === 0) {
    return [];
  }

  const uniqueDates = Array.from(new Set(dates));
  const authSession = session ?? (await login());
  const results: DailyAvailability[] = [];

  for (const isoDate of uniqueDates) {
    try {
      const date = parseISODate(isoDate);
      const slots = await getAllSlotsOnDate(authSession, date);
      const grouped = filterAndGroupSlots(slots, fromTime, toTime);

      const label = [...grouped.keys()][0] ?? slots[0]?.formattedDate ?? isoDate;

      results.push({
        isoDate,
        label,
        grouped,
        slots,
      });
    } catch (error) {
      logger.error("Failed to fetch availability for date", { isoDate, error });
    }
  }

  return results;
}
