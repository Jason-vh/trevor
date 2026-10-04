import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

import type { Trevor } from "@/agent/trevor";
import { getBookingOrigins } from "@/modules/booking-origins";
import { getMetadata, setMetadata } from "@/modules/metadata";
import { getSession } from "@/modules/session-manager";
import { getAllSlotsOnDate } from "@/modules/slots";
import { config } from "@/utils/config";
import { getCurrentDateISO, getCurrentTime } from "@/utils/datetime";
import { logger } from "@/utils/logger";
import { buildReminderTask, groupBookingsByChat, shouldSendReminder } from "@/utils/reminders";

const REMINDER_SENT_KEY = "reminders_sent_date";

/** Each chat with a court booked today gets a reminder, written by Trevor. */
export async function sendDailyReminders(trevor: Trevor): Promise<void> {
  const today = getCurrentDateISO();
  const lastSent = await getMetadata(REMINDER_SENT_KEY);

  if (!shouldSendReminder(getCurrentTime(), today, lastSent?.value ?? null)) {
    return;
  }

  const session = await getSession();
  const slots = await getAllSlotsOnDate(session, new Date());
  const bookings = slots.filter((slot) => slot.isOwnBooking);
  const { byChat, withoutChat } = groupBookingsByChat(bookings, await getBookingOrigins(today));

  if (withoutChat.length > 0) {
    logger.info("Reminders: no reminder for bookings made outside Trevor", {
      date: today,
      bookings: withoutChat.map((booking) => `${booking.formattedStartTime} ${booking.courtName}`),
    });
  }

  for (const [chatId, chatBookings] of byChat) {
    if (!config.telegram.chatIds.has(chatId)) continue;

    // The request ID makes Trevor do this once per chat per day, even if this runs again.
    const submission = await trevor.assign(chatId, buildReminderTask(chatBookings), `reminder:${today}`);
    logger.info("Reminders: asked Trevor to remind the chat", {
      chatId,
      date: today,
      bookingCount: chatBookings.length,
    });

    submission
      .wait(BACKGROUND_CONTEXT)
      .then((settled) => {
        if (settled.status === "unanswered") {
          logger.error("Reminders: Trevor did not send the reminder", { chatId, reason: settled.reason });
        }
      })
      .catch((error) => logger.error("Reminders: failed to follow up", { chatId, error }));
  }

  await setMetadata(REMINDER_SENT_KEY, today);
}
