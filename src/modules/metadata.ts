import { eq } from "drizzle-orm";

import { db } from "@/db";
import { metadata } from "@/db/schema";

export async function setMetadata(key: string, value: string) {
  await db
    .insert(metadata)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: metadata.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getMetadata(key: string): Promise<{ value: string; updatedAt: Date } | null> {
  const [row] = await db.select().from(metadata).where(eq(metadata.key, key));
  return row ? { value: row.value, updatedAt: row.updatedAt } : null;
}
