// Parser module - Extract availability data from HTML

import * as cheerio from "cheerio";
import type { Availability } from "../../types";
import { ErrorCode, ScraperError } from "../../utils/errors";
import { createLogger } from "../../utils/logger";

const logger = createLogger("parser");

export function parseReservationsPage(
  html: string,
  date?: string
): Availability[] {
  logger.info("Parsing reservations page", {
    htmlSize: html.length,
    requestedDate: date,
  });

  try {
    const $ = cheerio.load(html);
    const availabilities: Availability[] = [];

    // Use provided date, or extract from page (look for loadMatrix call), or fallback to today
    const dateMatch = html.match(/loadMatrix\('(\d{4}-\d{2}-\d{2})'/);
    const pageDate =
      date ||
      (dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0]);

    // Parse court names from header row
    const courtNames = new Map<string, string>();
    $("thead.matrix-header th.header-name").each((i, el) => {
      const courtName = $(el).text().trim();
      const courtClass = $(el).attr("class") || "";
      const match = courtClass.match(/r-(\d+)/);
      if (match && courtName) {
        const courtId = match[1];
        courtNames.set(courtId, courtName);
      }
    });

    logger.info("Found courts", {
      count: courtNames.size,
      courts: Array.from(courtNames.values()),
      date: pageDate,
    });

    // Parse time slots and availability
    $("tr[data-time]").each((i, row) => {
      const $row = $(row);
      const timeStr = $row.attr("data-time");
      const timestamp = $row.attr("utc");

      if (!timeStr || !timestamp) return;

      // Find all slots (both free and taken) in this row
      $row.find("td.slot").each((_, cell) => {
        const $cell = $(cell);
        const cellClass = $cell.attr("class") || "";

        // Extract court ID from class (e.g., "r-51")
        const match = cellClass.match(/r-(\d+)/);
        if (!match) return;

        const courtId = match[1];
        const courtName = courtNames.get(courtId) || `Court ${courtId}`;

        // Determine if slot is available or taken
        const isFree = cellClass.includes("free");
        const isTaken = cellClass.includes("taken");

        // Skip if neither free nor taken (edge case)
        if (!isFree && !isTaken) return;

        // Get time from slot-period div or data-time attribute
        const slotPeriod = $cell.find(".slot-period").text().trim();
        const timeSlot = slotPeriod || timeStr;

        availabilities.push({
          court: courtName,
          courtId,
          date: new Date(parseInt(timestamp) * 1000),
          dateString: pageDate,
          timeSlot,
          timestamp,
          available: isFree,
          bookingUrl: `/reservations/make/${courtId}/${timestamp}`,
        });
      });
    });

    logger.info("Parsing complete", {
      availabilityCount: availabilities.length,
    });

    return availabilities;
  } catch (error) {
    throw new ScraperError(
      `Failed to parse HTML: ${
        error instanceof Error ? error.message : String(error)
      }`,
      ErrorCode.PARSE_ERROR,
      false // Parsing errors are not retryable
    );
  }
}
