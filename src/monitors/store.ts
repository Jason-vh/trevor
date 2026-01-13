import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MonitorWindow } from "@/types";
import { logger } from "@/utils/logger";

const STORE_PATH = join(process.cwd(), "data", "monitors.json");

async function ensureStoreExists(): Promise<void> {
  const dir = dirname(STORE_PATH);
  await mkdir(dir, { recursive: true });

  try {
    await Bun.file(STORE_PATH).text();
  } catch {
    await Bun.write(STORE_PATH, JSON.stringify([], null, 2));
  }
}

export async function readMonitors(): Promise<MonitorWindow[]> {
  await ensureStoreExists();

  try {
    const file = Bun.file(STORE_PATH);
    const contents = await file.text();
    return JSON.parse(contents) as MonitorWindow[];
  } catch (error) {
    logger.error("Failed to read monitor store", { error });
    return [];
  }
}

export async function writeMonitors(monitors: MonitorWindow[]): Promise<void> {
  await ensureStoreExists();
  await Bun.write(STORE_PATH, JSON.stringify(monitors, null, 2));
}
