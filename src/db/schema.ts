import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const queue = sqliteTable("queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: text("chat_id").notNull(),
  date: text("date").notNull(),
  timeFrom: text("time_from").notNull(),
  timeTo: text("time_to").notNull(),
  status: text("status").notNull().default("pending"),
  calendarEventId: text("calendar_event_id"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const metadata = sqliteTable("metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at"),
});

export const scores = sqliteTable("scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  player1: text("player1").notNull(),
  player2: text("player2").notNull(),
  score1: integer("score1").notNull(),
  score2: integer("score2").notNull(),
  createdAt: timestamp("created_at"),
});

export const courtPreferences = sqliteTable("court_preferences", {
  court: text("court").primaryKey(),
  tier: text("tier").notNull(),
  updatedAt: timestamp("updated_at"),
});

/** Which chat asked for each court Trevor booked, so reminders go back to that chat. */
export const bookingOrigins = sqliteTable(
  "booking_origins",
  {
    date: text("date").notNull(),
    time: text("time").notNull(),
    court: text("court").notNull(),
    chatId: text("chat_id").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [primaryKey({ columns: [table.date, table.time, table.court] })],
);
