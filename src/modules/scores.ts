import { desc } from "drizzle-orm";

import { db } from "@/db";
import { scores } from "@/db/schema";

export async function recordScore(date: string, player1: string, player2: string, score1: number, score2: number) {
  const [entry] = await db.insert(scores).values({ date, player1, player2, score1, score2 }).returning();
  return entry;
}

export async function listScores(limit = 10) {
  return db.select().from(scores).orderBy(desc(scores.date), desc(scores.createdAt)).limit(limit);
}
