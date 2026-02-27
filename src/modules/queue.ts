import { and, eq, lt } from "drizzle-orm";

import { db } from "@/db";
import { queue } from "@/db/schema";
import { logger } from "@/utils/logger";

export async function addToQueue(date: string, timeFrom: string, timeTo: string) {
  const [entry] = await db
    .insert(queue)
    .values({
      date,
      timeFrom,
      timeTo,
      status: "pending",
    })
    .returning();
  return entry;
}

export async function listPendingQueue() {
  return db.select().from(queue).where(eq(queue.status, "pending"));
}

export async function removeFromQueue(id: number) {
  await db.update(queue).set({ status: "cancelled", updatedAt: new Date() }).where(eq(queue.id, id));
}

export async function getProcessableEntries() {
  return db.select().from(queue).where(eq(queue.status, "pending"));
}

export async function setQueueStatus(id: number, status: string) {
  await db.update(queue).set({ status, updatedAt: new Date() }).where(eq(queue.id, id));
}

export async function expirePastEntries() {
  const today = new Date().toISOString().split("T")[0];
  const result = await db
    .update(queue)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(queue.status, "pending"), lt(queue.date, today)))
    .returning({ id: queue.id });
  if (result.length > 0) {
    logger.info("Queue: expired past entries", { expiredCount: result.length, expiredIds: result.map((r) => r.id) });
  }
}
