import * as cheerio from "cheerio";

import type { CourtAvailability } from "@/types";
import { getTimeInMinutes } from "@/utils/datetime";
import { logger } from "@/utils/logger";

const COURT_ID_REGEX = /r-(\d+)/;

function parseCell(cellClass: string): Pick<CourtAvailability, "courtId" | "isAvailable" | "offPeak"> {
  const isAvailable = cellClass.includes("free");
  const offPeak = cellClass.includes("off-peak");
  const courtId = cellClass.match(COURT_ID_REGEX)?.[1];

  if (!courtId) {
    throw new Error(`Court ID not found for cell with class "${cellClass}"`);
  }

  return {
    courtId: parseInt(courtId),
    isAvailable,
    offPeak,
  };
}

export function getSlotsFromHTML(html: string, dateISO: string): CourtAvailability[] {
  logger.info("Parsing reservations page");

  const $ = cheerio.load(html);
  const slots: CourtAvailability[] = [];

  const courts = new Map<number, string>();

  const formattedDate = $("#matrix_date_title").text().trim();

  if (!formattedDate) {
    throw new Error("Date not found in header");
  }

  /**
   * the text in the header rows contain the court names,
   * and the class contain the court ids
   */
  $("thead.matrix-header th.header-name").each((_, el) => {
    const thName = $(el).text().trim();
    const thClass = $(el).attr("class");

    if (!thClass) {
      return;
    }

    const match = thClass.match(/r-(\d+)/);
    if (match && thName) {
      const courtId = parseInt(match[1]);
      courts.set(courtId, thName);
    }
  });

  $("tr[data-time]").each((_, row) => {
    const $row = $(row);
    const formattedStartTime = $row.attr("data-time");
    const utc = $row.attr("utc") ?? "";

    if (!formattedStartTime) {
      throw new Error("Time not found for row");
    }

    const startTimeInMinutes = getTimeInMinutes(formattedStartTime);

    $row.find("td.slot").each((_, cell) => {
      const cellClass = $(cell).attr("class");

      // we don't care about closed courts
      if (!cellClass || cellClass.includes("closed")) {
        return;
      }
      const { courtId, isAvailable, offPeak } = parseCell(cellClass);

      const courtName = courts.get(courtId);
      if (!courtName) {
        throw new Error(`Court name not found for court ID ${courtId}`);
      }

      const slot: CourtAvailability = {
        courtId,
        courtName,
        isAvailable,
        offPeak,
        formattedStartTime,
        startTimeInMinutes,
        formattedDate,
        dateISO,
        utc,
      };

      slots.push(slot);
    });
  });

  return slots;
}
