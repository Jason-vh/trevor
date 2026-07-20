import * as cheerio from "cheerio";

import { SQUASH_CITY_URL } from "@/constants";
import { getPage, postPage } from "@/modules/scraper";
import type { Session } from "@/types";
import { logger } from "@/utils/logger";

const RESERVATIONS_URL = `${SQUASH_CITY_URL}/reservations`;
const MATRIX_ACTION_TOKEN_REGEX = /matrixActionToken\s*=\s*['"]([a-f0-9]+)['"]/;

export type CancelResult = { success: boolean; error?: string };

/**
 * Cancels a reservation using the site's two-step flow (mirrors booking):
 * 1. GET the reservation page → read the matrixActionToken
 * 2. POST to /reservations/{id}/cancel → returns a confirmation form
 * 3. POST the confirmation form's hidden fields (_token + confirmed=1) → cancels
 * A successful cancel returns JSON: {"message":["success","Reservering geannuleerd"]}.
 */
export async function cancelReservation(reservationId: string, session: Session): Promise<CancelResult> {
  const elapsed = logger.time();
  logger.info("Cancel: attempt", { reservationId });

  const detailUrl = `${RESERVATIONS_URL}/${reservationId}`;
  const cancelUrl = `${RESERVATIONS_URL}/${reservationId}/cancel`;

  try {
    // Step 1: read the action token from the reservation page
    const detailHtml = await getPage(detailUrl, session);
    const actionToken = detailHtml.match(MATRIX_ACTION_TOKEN_REGEX)?.[1];
    if (!actionToken) {
      return { success: false, error: "Could not find the reservation (it may no longer exist)." };
    }

    // Step 2: POST to get the confirmation form
    const confirmResponse = await postPage(cancelUrl, `_token=${actionToken}`, session, detailUrl);
    const confirmHtml = await confirmResponse.text();

    const $ = cheerio.load(confirmHtml);
    const fields = new URLSearchParams();
    $("form input[type=hidden]").each((_, el) => {
      const name = $(el).attr("name");
      const value = $(el).attr("value") ?? "";
      if (name) fields.set(name, value);
    });

    if (!fields.has("_token")) {
      return { success: false, error: "No confirmation token in cancel form." };
    }
    if (!fields.has("confirmed")) {
      fields.set("confirmed", "1");
    }

    // Step 3: POST the confirmation to finalize the cancellation
    const finalResponse = await postPage(cancelUrl, fields.toString(), session, cancelUrl);
    const finalText = await finalResponse.text();

    try {
      const result = JSON.parse(finalText);
      const message = Array.isArray(result.message) ? result.message : [];
      if (message[0] === "success") {
        logger.info("Cancel: success", { reservationId, latencyMs: elapsed() });
        return { success: true };
      }
      logger.warn("Cancel: server rejected", { reservationId, message, latencyMs: elapsed() });
      return { success: false, error: message.slice(1).join(" ") || "Cancellation was rejected." };
    } catch {
      logger.warn("Cancel: unexpected response", {
        reservationId,
        status: finalResponse.status,
        latencyMs: elapsed(),
      });
      return { success: false, error: `Unexpected response (status ${finalResponse.status}).` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Cancel: failed with exception", { reservationId, error: message, latencyMs: elapsed() });
    return { success: false, error: message };
  }
}
