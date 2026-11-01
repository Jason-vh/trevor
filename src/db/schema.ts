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
  /** Set when a weekly booking created this entry. */
  recurringBookingId: integer("recurring_booking_id"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

/** A court to book every week, e.g. Tuesdays between 18:30 and 19:00. */
export const recurringBookings = sqliteTable("recurring_bookings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: text("chat_id").notNull(),
  weekday: text("weekday").notNull(),
  timeFrom: text("time_from").notNull(),
  timeTo: text("time_to").notNull(),
  createdAt: timestamp("created_at"),
  stoppedAt: integer("stopped_at", { mode: "timestamp_ms" }),
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

/** A calendar invite Trevor sends from trevor@vhtm.eu: a placeholder while a request is queued, then the booked court. */
export const calendarEvents = sqliteTable("calendar_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  timeFrom: text("time_from").notNull(),
  timeTo: text("time_to").notNull(),
  /** Null while the event is a placeholder for a queued request. */
  court: text("court"),
  sequence: integer("sequence").notNull().default(0),
  /** The last sequence that went out by email; behind `sequence` until it's sent. */
  sentSequence: integer("sent_sequence"),
  cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
