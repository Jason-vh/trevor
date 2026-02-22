import { join } from "node:path";
import { rename } from "node:fs/promises";

import type { BookedSlot, CourtAvailability } from "@/types";
import { logger } from "@/utils/logger";

const DATA_DIR = join(process.cwd(), "data");
const STATE_FILE_PATH = join(DATA_DIR, "state.json");
const BOOKED_FILE_PATH = join(DATA_DIR, "booked.json");

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

export async function loadBookedSlots(): Promise<BookedSlot[]> {
  try {
    const slots: BookedSlot[] = await Bun.file(BOOKED_FILE_PATH).json();
    logger.info(`Loaded ${slots.length} booked slots`);
    return slots;
  } catch {
    return [];
  }
}

export async function saveBookedSlot(slot: BookedSlot): Promise<void> {
  const existing = await loadBookedSlots();
  existing.push(slot);

  const tmpPath = join(DATA_DIR, `booked-${Date.now()}.tmp.json`);
  await Bun.write(tmpPath, JSON.stringify(existing, null, 2));
  await rename(tmpPath, BOOKED_FILE_PATH);

  logger.info("Saved booked slot", { slot });
}

export async function cleanupBookedSlots(): Promise<void> {
  const slots = await loadBookedSlots();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
  const filtered = slots.filter((slot) => slot.dateISO >= today);

  if (filtered.length !== slots.length) {
    logger.info(`Cleaning up ${slots.length - filtered.length} past booked slots`);
    const tmpPath = join(DATA_DIR, `booked-${Date.now()}.tmp.json`);
    await Bun.write(tmpPath, JSON.stringify(filtered, null, 2));
    await rename(tmpPath, BOOKED_FILE_PATH);
  }
}
