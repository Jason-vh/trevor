import { login } from "@/modules/auth";
import { buildMessage, notify } from "@/modules/notify";
import { filterAndGroupSlots, getAllSlotsOnDate } from "@/modules/slots";
import { findChangedSlots, loadState, saveState } from "@/modules/state";
import { getArgs } from "@/utils/args";
import { getNextDays } from "@/utils/datetime";
import { logger } from "@/utils/logger";

async function main() {
  const DAYS_TO_LOOK_AHEAD = 7;

  const args = getArgs();

  const upcomingDays = getNextDays(DAYS_TO_LOOK_AHEAD).filter(({ day }) => args.days.includes(day));
  logger.info("We're looking for availability on the following dates", { upcomingDays, ...args });

  const session = await login();

  const slotsPerDay = await Promise.all(upcomingDays.map(async ({ date }) => await getAllSlotsOnDate(session, date)));
  const allSlots = slotsPerDay.flat();

  const changedSlots = findChangedSlots(await loadState(), allSlots);
  logger.info(`Found ${changedSlots.length} changed slots`, { changedSlots });

  saveState(allSlots);

  const groupedSlots = filterAndGroupSlots(changedSlots, args.from, args.to);

  if (groupedSlots.size === 0) {
    logger.info("Exiting - no useful slots found");
    return;
  }

  const message = buildMessage(groupedSlots);
  notify(message);
}

main().catch((error) => {
  logger.error(error);
  process.exit(1);
});
