import { getSession } from "@/modules/session-manager";
import { getAllSlotsOnDate } from "@/modules/slots";
import { getNextDays } from "@/utils/datetime";

export async function getUpcomingReservations() {
  const session = await getSession();
  const days = getNextDays(8);

  const results = await Promise.allSettled(days.map(({ date }) => getAllSlotsOnDate(session, date)));

  const ownBookings = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value.filter((s) => s.isOwnBooking) : [],
  );

  return ownBookings.map((s) => ({
    courtName: s.courtName,
    date: s.formattedDate,
    dateISO: s.dateISO,
    time: s.formattedStartTime,
  }));
}
