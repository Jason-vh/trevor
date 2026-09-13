import type { CourtAvailability, CourtTier } from "@/types";

const TIER_RANK: Record<CourtTier, number> = {
  preferred: 0,
  neutral: 1,
  avoided: 2,
};

const COURT_NUMBER_REGEX = /(\d+)/;

export function normalizeCourtName(court: string): string | null {
  const number = court.match(COURT_NUMBER_REGEX)?.[1];
  if (!number) return null;
  return `Baan ${parseInt(number)}`;
}

export function getTier(tiers: Map<string, CourtTier>, courtName: string): CourtTier {
  return tiers.get(courtName) ?? "neutral";
}

export function compareByTier(a: CourtTier, b: CourtTier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}

/**
 * Earliest date, then earliest time, then the most preferred court.
 * A better court never outranks an earlier slot.
 */
export function sortSlotsByPreference(slots: CourtAvailability[], tiers: Map<string, CourtTier>): CourtAvailability[] {
  return [...slots].sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
    if (a.startTimeInMinutes !== b.startTimeInMinutes) return a.startTimeInMinutes - b.startTimeInMinutes;
    return compareByTier(getTier(tiers, a.courtName), getTier(tiers, b.courtName));
  });
}
