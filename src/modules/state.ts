import { join } from "node:path";

import type { CourtAvailability } from "@/types";
import { logger } from "@/utils/logger";

const DATA_DIR = join(process.cwd(), "data");
const STATE_FILE_PATH = join(DATA_DIR, "state.json");

export function saveState(slots: CourtAvailability[]): void {
  logger.info(`Saving ${slots.length} slots to state`);

  Bun.write(STATE_FILE_PATH, JSON.stringify(slots, null, 2));
}

export async function loadState(): Promise<CourtAvailability[]> {
  try {
    const slots: CourtAvailability[] = await Bun.file(STATE_FILE_PATH).json();

    logger.info(`Loaded ${slots.length} slots from state`);

    return slots;
  } catch (error) {
    logger.error("Error loading state", { error });
    return [];
  }
}

export function findChangedSlots(oldSlots: CourtAvailability[], newSlots: CourtAvailability[]): CourtAvailability[] {
  return newSlots.filter((newSlot) => {
    const oldSlot = oldSlots.find(
      (oldSlot) =>
        oldSlot.courtId === newSlot.courtId &&
        oldSlot.formattedStartTime === newSlot.formattedStartTime &&
        oldSlot.formattedDate === newSlot.formattedDate &&
        oldSlot.isAvailable === newSlot.isAvailable,
    );

    return oldSlot === undefined;
  });
}

