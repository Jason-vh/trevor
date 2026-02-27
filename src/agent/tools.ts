import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { bookSlot } from "@/modules/booking";
import { createConfirmedEvent, createTentativeEvent } from "@/modules/calendar";
import { addToQueue, listPendingQueue, removeFromQueue, setQueueCalendarEventId } from "@/modules/queue";
import { getSession } from "@/modules/session-manager";
import { getAllSlotsOnDate, filterByTimeRange } from "@/modules/slots";
import { formatDateISO, getNextDays } from "@/utils/datetime";
import { logger } from "@/utils/logger";

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
    const elapsed = logger.time();
    logger.info("Tool: check_availability", { date: params.date, timeFrom: params.time_from, timeTo: params.time_to });

    try {
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

      logger.info("Tool: check_availability completed", {
        date: params.date,
        availableCount: result.length,
        latencyMs: elapsed(),
      });

      if (result.length === 0) {
        return text("No available courts found for the given date/time range.");
      }

      return text(JSON.stringify(result, null, 2));
    } catch (error) {
      logger.error("Tool: check_availability failed", { date: params.date, latencyMs: elapsed(), error });
      throw error;
    }
  },
};

const bookCourt: AgentTool<typeof bookCourtParams> = {
  name: "book_court",
  label: "Book Court",
  description: "Book a specific squash court. Requires the court ID, date, and time.",
  parameters: bookCourtParams,
  execute: async (_toolCallId, params) => {
    const elapsed = logger.time();
    logger.info("Tool: book_court", { date: params.date, time: params.time, courtId: params.court_id });

    try {
      const session = await getSession();
      const dateObj = new Date(params.date + "T12:00:00");
      const allSlots = await getAllSlotsOnDate(session, dateObj);

      const targetSlot = allSlots.find(
        (s) => s.courtId === params.court_id && s.formattedStartTime === params.time && s.isAvailable,
      );

      if (!targetSlot) {
        logger.warn("Tool: book_court slot not found or unavailable", {
          date: params.date,
          time: params.time,
          courtId: params.court_id,
          latencyMs: elapsed(),
        });
        return text("Could not find the requested court/time slot, or it's no longer available.");
      }

      const result = await bookSlot(targetSlot, session);

      if (result.success) {
        logger.info("Tool: book_court succeeded", {
          date: params.date,
          time: params.time,
          courtId: params.court_id,
          courtName: targetSlot.courtName,
          reservationId: result.reservationId,
          latencyMs: elapsed(),
        });
        await createConfirmedEvent(targetSlot.courtName, targetSlot.dateISO, targetSlot.formattedStartTime).catch(
          (err) => logger.warn("Tool: book_court calendar event failed", { error: err }),
        );
        return text(
          `Successfully booked ${targetSlot.courtName} on ${targetSlot.formattedDate} at ${targetSlot.formattedStartTime}. Reservation ID: ${result.reservationId || "N/A"}`,
        );
      }

      logger.warn("Tool: book_court failed", {
        date: params.date,
        time: params.time,
        courtId: params.court_id,
        courtName: targetSlot.courtName,
        error: result.error,
        latencyMs: elapsed(),
      });
      return text(`Booking failed: ${result.error}`);
    } catch (error) {
      logger.error("Tool: book_court threw", {
        date: params.date,
        time: params.time,
        courtId: params.court_id,
        latencyMs: elapsed(),
        error,
      });
      throw error;
    }
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

function makeAddToQueueTool(chatId: string): AgentTool<typeof addToQueueParams> {
  return {
    name: "add_to_queue",
    label: "Add to Queue",
    description:
      "Add a booking request to the queue for automatic retry every 5 minutes. Use this when no courts are currently available.",
    parameters: addToQueueParams,
    execute: async (_toolCallId, params) => {
      logger.info("Tool: add_to_queue", { date: params.date, timeFrom: params.time_from, timeTo: params.time_to });
      const entry = await addToQueue(chatId, params.date, params.time_from, params.time_to);
      logger.info("Tool: add_to_queue entry created", {
        id: entry.id,
        date: params.date,
        timeFrom: params.time_from,
        timeTo: params.time_to,
      });
      const eventId = await createTentativeEvent(params.date, params.time_from, params.time_to);
      if (eventId) await setQueueCalendarEventId(entry.id, eventId);
      return text(
        `Added to queue (ID: ${entry.id}). I'll check every 5 minutes and book when a court becomes available.`,
      );
    },
  };
}

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
    logger.info("Tool: remove_from_queue", { id: params.id });
    await removeFromQueue(params.id);
    logger.info("Tool: remove_from_queue cancelled", { id: params.id });
    return text(`Removed queue entry ${params.id}.`);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AgentTool array requires any for contravariant execute params
export function createTools(chatId: string): AgentTool<any>[] {
  return [
    getTodayDate,
    checkAvailability,
    bookCourt,
    listMyReservations,
    makeAddToQueueTool(chatId),
    listQueueTool,
    removeFromQueueTool,
  ];
}
