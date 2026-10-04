import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { registerStorageConformance } from "@earendil-works/pi-durable/testing";

import { openConversationStorage } from "./storage";

registerStorageConformance({ describe, expect, it }, "bun:sqlite conversation storage", async (use) => {
  const directory = mkdtempSync(join(tmpdir(), "trevor-storage-"));
  const storage = await openConversationStorage(join(directory, "conversations.db"));
  try {
    await use(storage);
  } finally {
    await storage.close(BACKGROUND_CONTEXT);
    rmSync(directory, { recursive: true, force: true });
  }
});
