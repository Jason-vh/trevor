// State tracking for slot availability changes

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Availability } from '../../types';

export interface SlotState {
  slotKey: string; // "2025-10-03_17:00_Baan1"
  lastSeen: Date;
  wasAvailable: boolean;
}

export interface StateStore {
  slots: Map<string, SlotState>;
  lastUpdate: Date;
}

const STATE_FILE_PATH = join(process.cwd(), 'data', 'slot-state.json');
const MAX_AGE_DAYS = 7;

/**
 * Generate unique key for a slot
 */
export function generateSlotKey(slot: Availability): string {
  return `${slot.dateString}_${slot.timeSlot}_${slot.court}`;
}

/**
 * Load state from disk
 */
export async function loadState(): Promise<StateStore> {
  try {
    if (!existsSync(STATE_FILE_PATH)) {
      return {
        slots: new Map(),
        lastUpdate: new Date(),
      };
    }

    const fileContent = Bun.file(STATE_FILE_PATH);
    const json = await fileContent.json();

    // Convert plain object to Map and parse dates
    const slots = new Map<string, SlotState>();
    for (const [key, value] of Object.entries(json.slots || {})) {
      const state = value as any;
      slots.set(key, {
        slotKey: state.slotKey,
        lastSeen: new Date(state.lastSeen),
        wasAvailable: state.wasAvailable,
      });
    }

    return {
      slots,
      lastUpdate: new Date(json.lastUpdate || new Date()),
    };
  } catch (error) {
    console.warn('⚠️  Failed to load state file, starting fresh:', error instanceof Error ? error.message : String(error));
    return {
      slots: new Map(),
      lastUpdate: new Date(),
    };
  }
}

/**
 * Save state to disk atomically
 */
export async function saveState(state: StateStore): Promise<void> {
  try {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Convert Map to plain object for JSON serialization
    const json = {
      lastUpdate: state.lastUpdate.toISOString(),
      slots: Object.fromEntries(
        Array.from(state.slots.entries()).map(([key, value]) => [
          key,
          {
            slotKey: value.slotKey,
            lastSeen: value.lastSeen.toISOString(),
            wasAvailable: value.wasAvailable,
          },
        ])
      ),
    };

    // Atomic write: write to temp file, then rename
    const tempPath = `${STATE_FILE_PATH}.tmp`;
    await Bun.write(tempPath, JSON.stringify(json, null, 2));

    // Rename is atomic on most filesystems
    await Bun.write(STATE_FILE_PATH, await Bun.file(tempPath).text());

    // Clean up temp file
    try {
      await Bun.file(tempPath).delete();
    } catch {
      // Ignore errors on temp file cleanup
    }
  } catch (error) {
    console.error('⚠️  Failed to save state file:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Prune entries older than MAX_AGE_DAYS
 */
export function pruneOldEntries(state: StateStore): StateStore {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS);

  const prunedSlots = new Map<string, SlotState>();

  for (const [key, value] of state.slots.entries()) {
    if (value.lastSeen >= cutoffDate) {
      prunedSlots.set(key, value);
    }
  }

  return {
    slots: prunedSlots,
    lastUpdate: state.lastUpdate,
  };
}

/**
 * Compare previous and current states, return newly available slots
 * A slot is "newly available" if:
 * 1. It wasn't in previous state (new slot appeared), OR
 * 2. It was marked as unavailable in previous state but is available now
 */
export function compareStates(
  previousState: StateStore,
  currentSlots: Availability[]
): Availability[] {
  const newlyAvailable: Availability[] = [];

  for (const slot of currentSlots) {
    if (!slot.available) continue;

    const key = generateSlotKey(slot);
    const previousSlot = previousState.slots.get(key);

    // Case 1: New slot (didn't exist before)
    if (!previousSlot) {
      newlyAvailable.push(slot);
      continue;
    }

    // Case 2: Previously unavailable, now available
    if (!previousSlot.wasAvailable) {
      newlyAvailable.push(slot);
    }
  }

  return newlyAvailable;
}

/**
 * Update state with current slots
 */
export function updateState(
  previousState: StateStore,
  currentSlots: Availability[]
): StateStore {
  const now = new Date();
  const newSlots = new Map(previousState.slots);

  // Update all slots we saw in this check
  for (const slot of currentSlots) {
    const key = generateSlotKey(slot);
    newSlots.set(key, {
      slotKey: key,
      lastSeen: now,
      wasAvailable: slot.available,
    });
  }

  return {
    slots: newSlots,
    lastUpdate: now,
  };
}
