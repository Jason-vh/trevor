import { login } from "@/modules/auth";
import type { Session } from "@/types";
import { logger } from "@/utils/logger";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cachedSession: Session | null = null;
let sessionTimestamp = 0;

export async function getSession(): Promise<Session> {
  const now = Date.now();
  if (cachedSession && now - sessionTimestamp < SESSION_TTL_MS) {
    return cachedSession;
  }

  logger.info("Session expired or missing, logging in...");
  cachedSession = await login();
  sessionTimestamp = now;
  return cachedSession;
}

export function invalidateSession(): void {
  cachedSession = null;
  sessionTimestamp = 0;
}
