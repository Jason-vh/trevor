import { db } from "@/db";
import { courtPreferences } from "@/db/schema";
import type { CourtTier } from "@/types";
import { compareByTier } from "@/utils/courts";

export async function getCourtTiers(): Promise<Map<string, CourtTier>> {
  const rows = await db.select().from(courtPreferences);
  return new Map(rows.map((row) => [row.court, row.tier as CourtTier]));
}

export async function setCourtTier(court: string, tier: CourtTier) {
  await db
    .insert(courtPreferences)
    .values({ court, tier })
    .onConflictDoUpdate({
      target: courtPreferences.court,
      set: { tier, updatedAt: new Date() },
    });
}

export async function listCourtPreferences() {
  const tiers = await getCourtTiers();

  return [...tiers.entries()]
    .filter(([, tier]) => tier !== "neutral")
    .map(([court, tier]) => ({ court, tier }))
    .sort((a, b) => compareByTier(a.tier, b.tier) || a.court.localeCompare(b.court));
}
