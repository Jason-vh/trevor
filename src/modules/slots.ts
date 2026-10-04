import { SQUASH_CITY_URL } from "@/constants";
import { getSlotsFromHTML } from "@/modules/parser";
import { getPage } from "@/modules/scraper";
import type { CourtAvailability, Session } from "@/types";
import { formatDateISO, getTimeInMinutes } from "@/utils/datetime";

const SQUASH_SPORT_ID = 15;
const RESERVATIONS_URL = `${SQUASH_CITY_URL}/reservations`;

function getURL(dateISO: string): string {
  return `${RESERVATIONS_URL}/${dateISO}/sport/${SQUASH_SPORT_ID}`;
}

export function filterByTimeRange(slots: CourtAvailability[], startTime: string, endTime: string) {
  const startMinutes = getTimeInMinutes(startTime);
  const endMinutes = getTimeInMinutes(endTime);

  return slots.filter((slot) => {
    const slotMinutes = getTimeInMinutes(slot.formattedStartTime);
    return slotMinutes >= startMinutes && slotMinutes <= endMinutes;
  });
}

export async function getAllSlotsOnDate(session: Session, date: Date): Promise<CourtAvailability[]> {
  const dateISO = formatDateISO(date);
  const url = getURL(dateISO);
  const html = await getPage(url, session);

  return getSlotsFromHTML(html, dateISO);
}
