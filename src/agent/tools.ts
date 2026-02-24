import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { bookSlot } from "@/modules/booking";
import { addToQueue, listPendingQueue, removeFromQueue } from "@/modules/queue";
import { getSession } from "@/modules/session-manager";
import { getAllSlotsOnDate, filterByTimeRange } from "@/modules/slots";
import { formatDateISO, getNextDays } from "@/utils/datetime";

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }], details: undefined };
}

const emptyParams = Type.Object({});

const checkAvailabilityParams = Type.Object({
  date: Type.String({ description: "Date in YYYY-MM-DD format" }),
  time_from: Type.Optional(Type.String({ description: "Start time HH:MM (e.g. 18:00)" })),
  time_to: Type.Optional(Type.String({ description: "End time HH:MM (e.g. 19:00)" })),
});

const bookCourtParams = Type.Object({
  date: Type.String({ description: "Date in YYYY-MM-DD format" }),
  time: Type.String({ description: "Time in HH:MM format" }),
  court_id: Type.Number({ description: "Court ID number (from check_availability results)" }),
});

const addToQueueParams = Type.Object({
  date: Type.String({ description: "Target date in YYYY-MM-DD format" }),
  time_from: Type.String({ description: "Start of time range HH:MM" }),
  time_to: Type.String({ description: "End of time range HH:MM" }),
});

const removeFromQueueParams = Type.Object({
  id: Type.Number({ description: "Queue entry ID to cancel" }),
});

const getTodayDate: AgentTool<typeof emptyParams> = {
  name: "get_today_date",
  label: "Get Today's Date",
  description:
    "Get today's date and the next 8 days with weekday names. Use this to resolve relative dates like 'next Tuesday' or 'morgen'.",
  parameters: emptyParams,
  execute: async () => {
    const days = getNextDays(8);
    const result = days.map(({ day, date }) => ({
      weekday: day,
      date: formatDateISO(date),
      display: date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    }));
    return text(JSON.stringify(result, null, 2));
  },
};

const checkAvailability: AgentTool<typeof checkAvailabilityParams> = {
  name: "check_availability",
  label: "Check Availability",
  description: "Check available squash courts for a specific date and optional time range.",
  parameters: checkAvailabilityParams,
  execute: async (_toolCallId, params) => {
    const session = await getSession();
    const dateObj = new Date(params.date + "T12:00:00");
    const allSlots = await getAllSlotsOnDate(session, dateObj);

    let slots = allSlots;
    if (params.time_from && params.time_to) {
      slots = filterByTimeRange(allSlots, params.time_from, params.time_to);
    } else if (params.time_from) {
      slots = filterByTimeRange(allSlots, params.time_from, params.time_from);
    }

    const available = slots.filter((s) => s.isAvailable);
    const result = available.map((s) => ({
      courtName: s.courtName,
      courtId: s.courtId,
      time: s.formattedStartTime,
      date: s.formattedDate,
      dateISO: s.dateISO,
      offPeak: s.offPeak,
    }));

    if (result.length === 0) {
      return text("No available courts found for the given date/time range.");
    }

    return text(JSON.stringify(result, null, 2));
  },
};

const bookCourt: AgentTool<typeof bookCourtParams> = {
  name: "book_court",
  label: "Book Court",
  description: "Book a specific squash court. Requires the court ID, date, and time.",
  parameters: bookCourtParams,
  execute: async (_toolCallId, params) => {
    const session = await getSession();
    const dateObj = new Date(params.date + "T12:00:00");
    const allSlots = await getAllSlotsOnDate(session, dateObj);

    const targetSlot = allSlots.find(
      (s) => s.courtId === params.court_id && s.formattedStartTime === params.time && s.isAvailable,
    );

    if (!targetSlot) {
      return text("Could not find the requested court/time slot, or it's no longer available.");
    }

    const result = await bookSlot(targetSlot, session);

    if (result.success) {
      return text(
        `Successfully booked ${targetSlot.courtName} on ${targetSlot.formattedDate} at ${targetSlot.formattedStartTime}. Reservation ID: ${result.reservationId || "N/A"}`,
      );
    }

    return text(`Booking failed: ${result.error}`);
  },
};

const listMyReservations: AgentTool<typeof emptyParams> = {
  name: "list_my_reservations",
  label: "List My Reservations",
  description: "Show the user's upcoming squash court reservations for the next 8 days.",
  parameters: emptyParams,
  execute: async () => {
    const session = await getSession();
    const days = getNextDays(8);
    const ownBookings = [];

    for (const { date } of days) {
      try {
        const slots = await getAllSlotsOnDate(session, date);
        const own = slots.filter((s) => s.isOwnBooking);
        ownBookings.push(...own);
      } catch {
        // skip days that fail
      }
    }

    if (ownBookings.length === 0) {
      return text("No upcoming reservations found.");
    }

    const result = ownBookings.map((s) => ({
      courtName: s.courtName,
      date: s.formattedDate,
      dateISO: s.dateISO,
      time: s.formattedStartTime,
    }));

    return text(JSON.stringify(result, null, 2));
  },
};

const addToQueueTool: AgentTool<typeof addToQueueParams> = {
  name: "add_to_queue",
  label: "Add to Queue",
  description:
    "Add a booking request to the queue for automatic retry every 5 minutes. Use this when no courts are currently available.",
  parameters: addToQueueParams,
  execute: async (_toolCallId, params) => {
    const entry = await addToQueue(params.date, params.time_from, params.time_to);
    return text(
      `Added to queue (ID: ${entry.id}). I'll check every 5 minutes and book when a court becomes available.`,
    );
  },
};

const listQueueTool: AgentTool<typeof emptyParams> = {
  name: "list_queue",
  label: "List Queue",
  description: "Show all pending booking requests in the queue.",
  parameters: emptyParams,
  execute: async () => {
    const entries = await listPendingQueue();

    if (entries.length === 0) {
      return text("No pending requests in the queue.");
    }

    const result = entries.map((e) => ({
      id: e.id,
      date: e.date,
      timeFrom: e.timeFrom,
      timeTo: e.timeTo,
      status: e.status,
      createdAt: e.createdAt,
    }));

    return text(JSON.stringify(result, null, 2));
  },
};

const removeFromQueueTool: AgentTool<typeof removeFromQueueParams> = {
  name: "remove_from_queue",
  label: "Remove from Queue",
  description: "Cancel a pending booking request from the queue.",
  parameters: removeFromQueueParams,
  execute: async (_toolCallId, params) => {
    await removeFromQueue(params.id);
    return text(`Removed queue entry ${params.id}.`);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AgentTool array requires any for contravariant execute params
export const tools: AgentTool<any>[] = [
  getTodayDate,
  checkAvailability,
  bookCourt,
  listMyReservations,
  addToQueueTool,
  listQueueTool,
  removeFromQueueTool,
];
