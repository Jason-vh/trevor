/**
 * One-off: copies the queue, scores, court preferences and metadata from the old Postgres
 * database into SQLite. Refuses to run once SQLite has any of that data.
 *
 *   POSTGRES_URL=postgresql://... bun run scripts/import-postgres.ts
 */
import { SQL } from "bun";

import { db, migrateDatabase } from "@/db";
import { courtPreferences, metadata, queue, scores } from "@/db/schema";

const postgresUrl = Bun.env["POSTGRES_URL"];
if (!postgresUrl) throw new Error("Set POSTGRES_URL to the old database");

migrateDatabase();

const tables = [queue, scores, courtPreferences, metadata];
for (const table of tables) {
  if ((await db.select().from(table).limit(1)).length > 0) {
    throw new Error("SQLite already has data; refusing to import over it");
  }
}

const postgres = new SQL(postgresUrl);

const queueRows = await postgres`SELECT * FROM queue`;
const scoreRows = await postgres`SELECT * FROM scores`;
const preferenceRows = await postgres`SELECT * FROM court_preferences`;
const metadataRows = await postgres`SELECT * FROM metadata`;

db.transaction((tx) => {
  for (const row of queueRows) {
    tx.insert(queue)
      .values({
        id: row.id,
        chatId: row.chat_id,
        date: row.date,
        timeFrom: row.time_from,
        timeTo: row.time_to,
        status: row.status,
        calendarEventId: row.calendar_event_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
      .run();
  }
  for (const row of scoreRows) {
    tx.insert(scores)
      .values({
        id: row.id,
        date: row.date,
        player1: row.player1,
        player2: row.player2,
        score1: row.score1,
        score2: row.score2,
        createdAt: row.created_at,
      })
      .run();
  }
  for (const row of preferenceRows) {
    tx.insert(courtPreferences).values({ court: row.court, tier: row.tier, updatedAt: row.updated_at }).run();
  }
  for (const row of metadataRows) {
    tx.insert(metadata).values({ key: row.key, value: row.value, updatedAt: row.updated_at }).run();
  }
});

await postgres.close();

console.log(
  `Imported ${queueRows.length} queue entries, ${scoreRows.length} scores, ` +
    `${preferenceRows.length} court preferences and ${metadataRows.length} metadata rows.`,
);
