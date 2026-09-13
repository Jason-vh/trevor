import type { CourtAvailability } from "@/types";
import { getTimeInMinutes } from "@/utils/datetime";

export const REMINDER_TIME = "09:00";

export function shouldSendReminder(currentTime: string, today: string, lastSentDate: string | null): boolean {
  if (lastSentDate === today) return false;
  return getTimeInMinutes(currentTime) >= getTimeInMinutes(REMINDER_TIME);
}

export function buildReminderMessage(bookings: CourtAvailability[]): string {
  if (bookings.length === 1) {
    const [booking] = bookings;
    return `🎾 Squash today at ${booking.formattedStartTime} on ${booking.courtName}!`;
  }

  const lines = bookings.map((booking) => `• ${booking.formattedStartTime} — ${booking.courtName}`).join("\n");

  return `🎾 Squash today!\n\n${lines}`;
}
