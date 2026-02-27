import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const queue = pgTable("queue", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  date: text("date").notNull(),
  timeFrom: text("time_from").notNull(),
  timeTo: text("time_to").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  role: text("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
