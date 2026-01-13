import { SQUASH_CITY_URL } from "@/constants";
import { getSlotsFromHTML } from "@/modules/parser";
import { getPage } from "@/modules/scraper";
import type { CourtAvailability, Session } from "@/types";
import { getTimeInMinutes } from "@/utils/datetime";

const SQUASH_SPORT_ID = 15;
const RESERVATIONS_URL = `${SQUASH_CITY_URL}/reservations`;

function getURL(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${RESERVATIONS_URL}/${year}-${month}-${day}/sport/${SQUASH_SPORT_ID}`;
}

export function filterByTimeRange(slots: CourtAvailability[], startTime: string, endTime: string) {
  const startMinutes = getTimeInMinutes(startTime);
  const endMinutes = getTimeInMinutes(endTime);

  return slots.filter((slot) => {
    const slotMinutes = getTimeInMinutes(slot.formattedStartTime);
    return slotMinutes >= startMinutes && slotMinutes <= endMinutes;
  });
}

function groupByDate(slots: CourtAvailability[]) {
  return slots.reduce((acc, slot) => {
    const key = slot.formattedDate;
    const existing = acc.get(key);

    if (existing) {
      existing.push(slot);
    } else {
      acc.set(key, [slot]);
    }

    return acc;
  }, new Map<string, CourtAvailability[]>());
}

function groupByTime(slots: CourtAvailability[]) {
  return slots.reduce((acc, slot) => {
    const key = slot.formattedStartTime;
    const existing = acc.get(key);

    if (existing) {
      existing.push(slot);
    } else {
      acc.set(key, [slot]);
    }

    return acc;
  }, new Map<string, CourtAvailability[]>());
}

export function groupSlotsByDateAndTime(slots: CourtAvailability[]): Map<string, Map<string, CourtAvailability[]>> {
  const groupedByDate = groupByDate(slots);
  const groupedByTime: Map<string, Map<string, CourtAvailability[]>> = new Map();
  for (const [date, slotsForDate] of groupedByDate) {
    const groupedByTimeForDate = groupByTime(slotsForDate);
    groupedByTime.set(date, groupedByTimeForDate);
  }

  return groupedByTime;
}

/**
 * We filter out slots: first by time range, then by open slots
 * and then we group the open slots by date and time
 */
export function filterAndGroupSlots(
  slots: CourtAvailability[],
  startTime: string,
  endTime: string,
): Map<string, Map<string, CourtAvailability[]>> {
  const filteredSlots = filterByTimeRange(slots, startTime, endTime).filter((slot) => slot.isAvailable);

  return groupSlotsByDateAndTime(filteredSlots);
}

/**
 * Fetch open slots that fall in a given time range, grouped by time
 */
export async function getAllSlotsOnDate(session: Session, date: Date): Promise<CourtAvailability[]> {
  const url = getURL(date);
  const html = await getPage(url, session);

  return getSlotsFromHTML(html);
}
