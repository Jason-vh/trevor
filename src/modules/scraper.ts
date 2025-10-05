import type { Session } from "@/types";
import { logger } from "@/utils/logger";

export async function getPage(url: string, session: Session): Promise<string> {
  logger.info("Fetching page", { url });

  const headers: Bun.HeadersInit = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Cookie: session.cookies.map((cookie) => cookie.split(";")[0]).join("; "),
  };

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.statusText}, ${await response.text()}`, { cause: response });
  }

  const html = await response.text();

  logger.info("Page fetched successfully", { url });

  return html;
}
