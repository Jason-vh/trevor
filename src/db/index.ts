import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { config } from "@/utils/config";
import * as schema from "./schema";

const MIGRATIONS_FOLDER = new URL("../../drizzle", import.meta.url).pathname;

mkdirSync(dirname(config.databasePath), { recursive: true });

const sqlite = new Database(config.databasePath, { create: true });
sqlite.run("PRAGMA busy_timeout = 5000");
sqlite.run("PRAGMA journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

export function migrateDatabase() {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

export function closeDatabase() {
  sqlite.close();
}
