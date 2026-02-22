import { login } from "@/modules/auth";
import { bookSlot, getCandidateSlots } from "@/modules/booking";
import { buildBookingMessage, buildMessage, notify } from "@/modules/notify";
import { filterAndGroupSlots, filterByTimeRange, getAllSlotsOnDate } from "@/modules/slots";
import { cleanupBookedSlots, findChangedSlots, loadBookedSlots, loadState, saveBookedSlot, saveState } from "@/modules/state";
import type { BookedSlot } from "@/types";
import { getArgs } from "@/utils/args";
import { getNextDays } from "@/utils/datetime";
import { logger } from "@/utils/logger";

async function main() {
  const DAYS_TO_LOOK_AHEAD = 8;

  const args = getArgs();

  const upcomingDays = getNextDays(DAYS_TO_LOOK_AHEAD).filter(({ day }) => args.days.includes(day));
  logger.info("We're looking for availability on the following dates", { upcomingDays, ...args });

  const session = await login();

  const allSlots = [];
  for (const { date } of upcomingDays) {
    try {
      const slots = await getAllSlotsOnDate(session, date);
      allSlots.push(...slots);
    } catch (error) {
      logger.error("Failed to fetch slots for date", { date, error });
    }
  }

  const changedSlots = findChangedSlots(await loadState(), allSlots);
  logger.info(`Found ${changedSlots.length} changed slots`, { changedSlots });

  saveState(allSlots);

  // Auto-booking flow
  if (args.book) {
    await cleanupBookedSlots();
    const bookedSlots = await loadBookedSlots();

    const availableSlots = filterByTimeRange(allSlots, args.from, args.to);
    const candidates = getCandidateSlots(availableSlots, bookedSlots, args.from, args.to);

    logger.info(`Found ${candidates.length} booking candidates`);

    if (candidates.length > 0) {
      for (const candidate of candidates) {
        logger.info(`Attempting to book: ${candidate.courtName} on ${candidate.formattedDate} at ${candidate.formattedStartTime}`);

        const result = await bookSlot(candidate, session);

        if (result.success) {
          const bookedSlot: BookedSlot = {
            courtId: candidate.courtId,
            utc: candidate.utc,
            courtName: candidate.courtName,
            formattedStartTime: candidate.formattedStartTime,
            dateISO: candidate.dateISO,
            formattedDate: candidate.formattedDate,
            bookedAt: new Date().toISOString(),
          };
          await saveBookedSlot(bookedSlot);

          const message = buildBookingMessage(result);
          logger.info("Booking notification", { message });
          await notify(message);
          break;
        }

        logger.warn(`Booking failed for ${candidate.courtName}: ${result.error}, trying next candidate`);
      }
    }
  }

  // Existing notification flow for changed slots
  const groupedSlots = filterAndGroupSlots(changedSlots, args.from, args.to);

  if (groupedSlots.size === 0) {
    logger.info("Exiting - no useful slots found");
    return;
  }

  const message = buildMessage(groupedSlots);
  await notify(message);
}

main().catch((error) => {
  logger.error(error);
  process.exit(1);
});
