import type { CourtAvailability } from "@/types";
import { slotKey } from "@/utils/courts";
import { getTimeInMinutes } from "@/utils/datetime";

export const REMINDER_TIME = "09:00";

export function shouldSendReminder(currentTime: string, today: string, lastSentDate: string | null): boolean {
  if (lastSentDate === today) return false;
  return getTimeInMinutes(currentTime) >= getTimeInMinutes(REMINDER_TIME);
}

/** Today's bookings per chat that asked for them; bookings made outside Trevor have no chat. */
export function groupBookingsByChat(bookings: CourtAvailability[], origins: Map<string, string>) {
  const byChat = new Map<string, CourtAvailability[]>();
  const withoutChat: CourtAvailability[] = [];

  for (const booking of bookings) {
    const chatId = origins.get(slotKey(booking.formattedStartTime, booking.courtName));
    if (!chatId) {
      withoutChat.push(booking);
      continue;
    }
    byChat.set(chatId, [...(byChat.get(chatId) ?? []), booking]);
  }

  return { byChat, withoutChat };
}

export function buildReminderTask(bookings: CourtAvailability[]): string {
  const lines = bookings.map((booking) => `• ${booking.formattedStartTime} — ${booking.courtName}`).join("\n");

  return `It's the morning of a squash day. Booked today for this chat:\n${lines}\n\nSend the chat a short, friendly reminder with the time and court. Don't check, book or change anything.`;
}
