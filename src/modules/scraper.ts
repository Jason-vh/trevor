import { SQUASH_CITY_URL } from "@/constants";
import type { Session } from "@/types";
import { logger } from "@/utils/logger";

function getCookieHeader(session: Session): string {
  return session.cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

export async function getPage(url: string, session: Session): Promise<string> {
  const elapsed = logger.time();
  logger.debug("HTTP GET", { url });

  const headers: Bun.HeadersInit = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Cookie: getCookieHeader(session),
  };

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const body = await response.text();
    logger.error("HTTP GET failed", {
      url,
      status: response.status,
      statusText: response.statusText,
      latencyMs: elapsed(),
    });
    throw new Error(`Failed to fetch page: ${response.statusText}, ${body}`, { cause: response });
  }

  const html = await response.text();

  logger.debug("HTTP GET success", { url, status: response.status, latencyMs: elapsed() });

  return html;
}

export async function postPage(url: string, body: string, session: Session, referer: string): Promise<Response> {
  const elapsed = logger.time();
  logger.debug("HTTP POST", { url });

  const headers: Bun.HeadersInit = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Cookie: getCookieHeader(session),
    Referer: referer,
    Origin: SQUASH_CITY_URL,
  };

  const response = await fetch(url, { method: "POST", headers, body, redirect: "manual" });

  logger.debug("HTTP POST completed", { url, status: response.status, latencyMs: elapsed() });

  return response;
}
