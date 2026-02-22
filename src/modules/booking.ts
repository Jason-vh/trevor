import * as cheerio from "cheerio";

import { SQUASH_CITY_URL } from "@/constants";
import { getPage, postPage } from "@/modules/scraper";
import type { BookedSlot, BookingResult, CourtAvailability, Session } from "@/types";
import { getTimeInMinutes } from "@/utils/datetime";
import { logger } from "@/utils/logger";

// Default booking partner: Amp Varavarn
const BOOKING_PARTNER_ID = "1280498";

const RESERVATIONS_URL = `${SQUASH_CITY_URL}/reservations`;

/**
 * Returns available slots sorted by earliest date then earliest time,
 * excluding dates that already have a booking within the given time block.
 */
export function getCandidateSlots(
  slots: CourtAvailability[],
  bookedSlots: BookedSlot[],
  from: string,
  to: string,
): CourtAvailability[] {
  const fromMinutes = getTimeInMinutes(from);
  const toMinutes = getTimeInMinutes(to);

  // Only consider booked slots that fall within the requested time block
  const bookedDatesInBlock = new Set(
    bookedSlots
      .filter((b) => {
        const bookedMinutes = getTimeInMinutes(b.formattedStartTime);
        return bookedMinutes >= fromMinutes && bookedMinutes <= toMinutes;
      })
      .map((b) => b.dateISO),
  );

  return slots
    .filter((slot) => slot.isAvailable && !bookedDatesInBlock.has(slot.dateISO))
    .sort((a, b) => {
      if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
      return a.startTimeInMinutes - b.startTimeInMinutes;
    });
}

/**
 * Books a slot using the 3-step fetch flow:
 * 1. GET booking form
 * 2. POST to confirm (get confirmation page)
 * 3. POST with confirmed=1 (finalize booking)
 */
export async function bookSlot(slot: CourtAvailability, session: Session): Promise<BookingResult> {
  const { courtId, utc } = slot;

  try {
    // Step 1: GET the booking form
    const makeUrl = `${RESERVATIONS_URL}/make/${courtId}/${utc}`;
    logger.info("Step 1: Fetching booking form", { makeUrl });

    const formHtml = await getPage(makeUrl, session);
    const $form = cheerio.load(formHtml);

    // Extract all form values: hidden inputs and selected options from selects
    const formData = new URLSearchParams();

    $form("form input[type=hidden]").each((_, el) => {
      const name = $form(el).attr("name");
      const value = $form(el).val() as string;
      if (name) formData.set(name, value || "");
    });

    $form("form select").each((_, el) => {
      const name = $form(el).attr("name");
      const value = $form(el).find("option[selected]").val() as string;
      if (name) formData.set(name, value || "");
    });

    // Override player 2 with our booking partner
    formData.set("players[2]", BOOKING_PARTNER_ID);

    const token = formData.get("_token");
    if (!token) {
      return { success: false, slot, error: "No CSRF token found in booking form" };
    }

    logger.info("Step 2: Form data extracted", {
      fields: Object.fromEntries(formData.entries()),
    });

    // Step 2: POST to get confirmation page
    const confirmUrl = `${RESERVATIONS_URL}/confirm`;

    logger.info("Step 2: Posting to confirmation page", { confirmUrl });

    const confirmResponse = await postPage(confirmUrl, formData.toString(), session, makeUrl);
    const confirmHtml = await confirmResponse.text();

    // Handle redirect - follow it to get the confirmation page
    if (confirmResponse.status === 302) {
      const redirectUrl = confirmResponse.headers.get("Location");
      if (redirectUrl) {
        const fullRedirectUrl = redirectUrl.startsWith("http") ? redirectUrl : `${SQUASH_CITY_URL}${redirectUrl}`;
        const redirectHtml = await getPage(fullRedirectUrl, session);
        return parseAndSubmitConfirmation(redirectHtml, fullRedirectUrl, slot, session);
      }
    }

    if (confirmResponse.status === 200 || confirmResponse.status === 302) {
      return parseAndSubmitConfirmation(confirmHtml, confirmUrl, slot, session);
    }

    return { success: false, slot, error: `Step 2 failed with status ${confirmResponse.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Booking failed", { error: message, slot });
    return { success: false, slot, error: message };
  }
}

async function parseAndSubmitConfirmation(
  confirmHtml: string,
  referer: string,
  slot: CourtAvailability,
  session: Session,
): Promise<BookingResult> {
  const $confirm = cheerio.load(confirmHtml);

  // Extract all hidden fields from the confirmation form
  const formFields = new URLSearchParams();
  $confirm('form input[type="hidden"]').each((_, el) => {
    const name = $confirm(el).attr("name");
    const value = $confirm(el).val() as string;
    if (name && value !== undefined) {
      formFields.set(name, value);
    }
  });

  const freshToken = formFields.get("_token");
  if (!freshToken) {
    return { success: false, slot, error: "No CSRF token found in confirmation form" };
  }

  if (!formFields.has("confirmed")) {
    formFields.set("confirmed", "1");
  }

  // Step 3: POST with confirmed=1 to finalize
  const confirmUrl = `${RESERVATIONS_URL}/confirm`;
  logger.info("Step 3: Finalizing booking", { confirmUrl });

  const finalResponse = await postPage(confirmUrl, formFields.toString(), session, referer);
  const finalText = await finalResponse.text();

  // Try to parse as JSON (successful bookings return JSON)
  try {
    const result = JSON.parse(finalText);
    if (result.id) {
      logger.info("Booking successful", { reservationId: result.id, slot });
      return { success: true, slot, reservationId: String(result.id) };
    }
    return { success: false, slot, error: result.message || "Unknown booking error" };
  } catch {
    // Not JSON — check if it's a redirect (success) or HTML error
    if (finalResponse.status === 302 || finalResponse.status === 200) {
      // Check if the response contains a success indicator
      const $final = cheerio.load(finalText);
      const successMessage = $final(".alert-success").text().trim();
      if (successMessage) {
        logger.info("Booking successful (HTML response)", { slot });
        return { success: true, slot };
      }
    }
    return { success: false, slot, error: `Unexpected response (status ${finalResponse.status})` };
  }
}
