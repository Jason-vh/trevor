import { login } from "@/modules/auth";
import type { Session } from "@/types";
import { logger } from "@/utils/logger";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cachedSession: Session | null = null;
let sessionTimestamp = 0;

export async function getSession(): Promise<Session> {
  const now = Date.now();
  if (cachedSession && now - sessionTimestamp < SESSION_TTL_MS) {
    logger.debug("Session: cache hit", { ageMs: now - sessionTimestamp });
    return cachedSession;
  }

  const reason = cachedSession ? "expired" : "missing";
  logger.info("Session: cache miss, logging in", { reason });
  cachedSession = await login();
  sessionTimestamp = now;
  return cachedSession;
}

export function invalidateSession(): void {
  logger.info("Session: invalidated");
  cachedSession = null;
  sessionTimestamp = 0;
}
