import { Type, type TSchema } from "@earendil-works/pi-ai";
import { defineTool, type ToolExecutionResult, type ToolRegistration } from "@earendil-works/pi-durable";
import type { Bot } from "grammy";

import { getChatId } from "@/agent/chats";
import { bookSlot } from "@/modules/booking";
import { recordBookingOrigin } from "@/modules/booking-origins";
import { cancelReservation } from "@/modules/cancel";
import { createConfirmedEvent, deleteEvent } from "@/modules/calendar";
import { getCourtTiers, listCourtPreferences, setCourtTier } from "@/modules/court-preferences";
import { enqueue, listPendingQueue, removeFromQueue } from "@/modules/queue";
import { addRecurringBooking, listRecurringBookings, stopRecurringBooking } from "@/modules/recurring";
import { getUpcomingReservations } from "@/modules/reservations";
import { listScores, recordScore } from "@/modules/scores";
import { getSession } from "@/modules/session-manager";
import { filterByTimeRange, getAllSlotsOnDate } from "@/modules/slots";
import { getTier, normalizeCourtName, sortSlotsByPreference } from "@/utils/courts";
import { getCurrentDateISO, getMinutesUntil, WEEKDAYS } from "@/utils/datetime";
import { logger } from "@/utils/logger";

const TYPING_REFRESH_MS = 4_000;

// A court can't be cancelled for free close to its start time, so booking one that starts this
// soon needs a clear yes from the chat first.
const CONFIRMATION_WINDOW_MINUTES = 6 * 60;

const confirmedParameter = Type.Optional(
  Type.Boolean({
    description:
      "true only once someone in the chat clearly said yes to this exact date and time. Required within 6 hours of the start.",
  }),
);

function needsConfirmation(date: string, time: string, confirmed: boolean | undefined): boolean {
  return !confirmed && getMinutesUntil(date, time) < CONFIRMATION_WINDOW_MINUTES;
}

function text(content: string): ToolExecutionResult {
  return { content: [{ type: "text", text: content }] };
}

function json(value: unknown): ToolExecutionResult {
  return text(JSON.stringify(value, null, 2));
}

const checkAvailability = defineTool({
  name: "check_availability",
  description: "Check available squash courts for a specific date and optional time range.",
  parameters: Type.Object({
    date: Type.String({ description: "Date in YYYY-MM-DD format" }),
    time_from: Type.Optional(Type.String({ description: "Start time HH:MM (e.g. 18:00)" })),
    time_to: Type.Optional(Type.String({ description: "End time HH:MM (e.g. 19:00)" })),
  }),
  execute: async (args) => {
    const session = await getSession();
    const allSlots = await getAllSlotsOnDate(session, new Date(args.date + "T12:00:00"));

    let slots = allSlots;
    if (args.time_from) {
      slots = filterByTimeRange(allSlots, args.time_from, args.time_to ?? args.time_from);
    }

    const courtTiers = await getCourtTiers();
    const available = sortSlotsByPreference(
      slots.filter((slot) => slot.isAvailable),
      courtTiers,
    );

    logger.info("Tool: check_availability", { date: args.date, availableCount: available.length });

    if (available.length === 0) {
      return text("No available courts found for the given date/time range.");
    }

    return json(
      available.map((slot) => ({
        courtName: slot.courtName,
        courtId: slot.courtId,
        time: slot.formattedStartTime,
        date: slot.formattedDate,
        dateISO: slot.dateISO,
        offPeak: slot.offPeak,
        preference: getTier(courtTiers, slot.courtName),
      })),
    );
  },
});

const bookCourt = defineTool({
  name: "book_court",
  description: "Book a specific squash court. Requires the court ID, date, and time.",
  parameters: Type.Object({
    date: Type.String({ description: "Date in YYYY-MM-DD format" }),
    time: Type.String({ description: "Time in HH:MM format" }),
    court_id: Type.Number({ description: "Court ID number (from check_availability results)" }),
    confirmed: confirmedParameter,
  }),
  execute: async (args, api, context) => {
    if (needsConfirmation(args.date, args.time, args.confirmed)) {
      return text(
        "Not booked: this court starts within 6 hours, so it can't be cancelled for free. Ask the chat to confirm this court and time, and call book_court again with confirmed: true only after someone clearly says yes.",
      );
    }

    const session = await getSession();
    const allSlots = await getAllSlotsOnDate(session, new Date(args.date + "T12:00:00"));
    const slot = allSlots.find(
      (candidate) =>
        candidate.courtId === args.court_id && candidate.formattedStartTime === args.time && candidate.isAvailable,
    );

    if (!slot) {
      logger.warn("Tool: book_court slot not found or unavailable", { ...args });
      return text("Could not find the requested court/time slot, or it's no longer available.");
    }

    const result = await bookSlot(slot, session);

    if (!result.success) {
      logger.warn("Tool: book_court failed", { ...args, error: result.error });
      return text(`Booking failed: ${result.error}`);
    }

    logger.info("Tool: book_court succeeded", { ...args, courtName: slot.courtName });
    await recordBookingOrigin(await getChatId(api, api.conversationId, context), slot);
    await createConfirmedEvent(slot.courtName, slot.dateISO, slot.formattedStartTime).catch((error) =>
      logger.warn("Tool: book_court calendar event failed", { error }),
    );

    return text(`Successfully booked ${slot.courtName} on ${slot.formattedDate} at ${slot.formattedStartTime}.`);
  },
});

const listMyReservations = defineTool({
  name: "list_my_reservations",
  description: "Show our upcoming squash court reservations for the next 8 days.",
  parameters: Type.Object({}),
  execute: async () => {
    const reservations = await getUpcomingReservations();
    if (reservations.length === 0) return text("No upcoming reservations found.");
    return json(reservations);
  },
});

const cancelReservationTool = defineTool({
  name: "cancel_reservation",
  description:
    "Cancel one of our existing court reservations. Get the reservation_id from list_my_reservations first, and confirm with the chat before calling this.",
  parameters: Type.Object({
    reservation_id: Type.String({ description: "Reservation ID from list_my_reservations" }),
    date: Type.String({ description: "Reservation date in YYYY-MM-DD (for calendar cleanup)" }),
    time: Type.String({ description: "Reservation start time in HH:MM (for calendar cleanup)" }),
  }),
  execute: async (args) => {
    const session = await getSession();
    const result = await cancelReservation(args.reservation_id, session);

    if (!result.success) {
      logger.warn("Tool: cancel_reservation failed", { reservationId: args.reservation_id, error: result.error });
      return text(`Could not cancel the reservation: ${result.error}`);
    }

    logger.info("Tool: cancel_reservation succeeded", { reservationId: args.reservation_id });
    await deleteEvent(args.date, args.time).catch((error) =>
      logger.warn("Tool: cancel_reservation calendar delete failed", { error }),
    );

    return text(`Cancelled the reservation on ${args.date} at ${args.time}.`);
  },
});

const addToQueueTool = defineTool({
  name: "add_to_queue",
  description:
    "Add a booking request to the queue for automatic retry every 5 minutes. Use this when no courts are currently available.",
  parameters: Type.Object({
    date: Type.String({ description: "Target date in YYYY-MM-DD format" }),
    time_from: Type.String({ description: "Start of time range HH:MM" }),
    time_to: Type.String({ description: "End of time range HH:MM" }),
    confirmed: confirmedParameter,
  }),
  execute: async (args, api, context) => {
    const today = getCurrentDateISO();
    if (args.date < today) {
      return text(`Date ${args.date} is in the past. Today is ${today}. Please use a future date.`);
    }

    if (needsConfirmation(args.date, args.time_from, args.confirmed)) {
      return text(
        "Not queued: this time starts within 6 hours, so the queue could book a court that can't be cancelled for free. Ask the chat to confirm, and call add_to_queue again with confirmed: true only after someone clearly says yes.",
      );
    }

    const chatId = await getChatId(api, api.conversationId, context);
    const entry = await enqueue({ chatId, date: args.date, timeFrom: args.time_from, timeTo: args.time_to });
    logger.info("Tool: add_to_queue", { id: entry.id, ...args });

    return text(
      `Added to queue (ID: ${entry.id}). It is retried every 5 minutes and books the first court that opens up.`,
    );
  },
});

const listQueue = defineTool({
  name: "list_queue",
  description: "Show all pending booking requests in the queue.",
  parameters: Type.Object({}),
  execute: async () => {
    const entries = await listPendingQueue();
    if (entries.length === 0) return text("No pending requests in the queue.");
    return json(
      entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        timeFrom: entry.timeFrom,
        timeTo: entry.timeTo,
        weekly: entry.recurringBookingId !== null,
        createdAt: entry.createdAt,
      })),
    );
  },
});

const removeFromQueueTool = defineTool({
  name: "remove_from_queue",
  description: "Cancel a pending booking request from the queue.",
  parameters: Type.Object({
    id: Type.Number({ description: "Queue entry ID to cancel" }),
  }),
  execute: async (args) => {
    await removeFromQueue(args.id);
    logger.info("Tool: remove_from_queue", { id: args.id });
    return text(`Removed queue entry ${args.id}.`);
  },
});

const addRecurringBookingTool = defineTool({
  name: "add_recurring_booking",
  description:
    "Book a court every week on the same day and time range, for this chat. Each week is queued once SquashCity opens that day, 7 days ahead, and booked as soon as a court is free. To skip a week, remove that week's entry with remove_from_queue.",
  parameters: Type.Object({
    weekday: Type.Union(WEEKDAYS.map((day) => Type.Literal(day))),
    time_from: Type.String({ description: "Earliest start time HH:MM" }),
    time_to: Type.String({ description: "Latest start time HH:MM" }),
  }),
  execute: async (args, api, context) => {
    const chatId = await getChatId(api, api.conversationId, context);
    const rule = await addRecurringBooking(chatId, args.weekday, args.time_from, args.time_to);
    const weeks = (await listPendingQueue()).filter((entry) => entry.recurringBookingId === rule.id);

    return json({ weeklyBookingId: rule.id, queuedWeeks: weeks.map((entry) => entry.date) });
  },
});

const listRecurringBookingsTool = defineTool({
  name: "list_recurring_bookings",
  description: "Show this chat's weekly bookings.",
  parameters: Type.Object({}),
  execute: async (_args, api, context) => {
    const rules = await listRecurringBookings(await getChatId(api, api.conversationId, context));
    if (rules.length === 0) return text("No weekly bookings in this chat.");
    return json(
      rules.map((rule) => ({ id: rule.id, weekday: rule.weekday, timeFrom: rule.timeFrom, timeTo: rule.timeTo })),
    );
  },
});

const stopRecurringBookingTool = defineTool({
  name: "stop_recurring_booking",
  description:
    "Stop a weekly booking. Withdraws the weeks it queued that aren't booked yet; courts already booked stay booked.",
  parameters: Type.Object({
    id: Type.Number({ description: "Weekly booking ID from list_recurring_bookings" }),
  }),
  execute: async (args, api, context) => {
    const stopped = await stopRecurringBooking(args.id, await getChatId(api, api.conversationId, context));
    if (!stopped) return text("No such weekly booking in this chat.");
    return text("Stopped the weekly booking. Courts that were already booked stay booked.");
  },
});

const recordScoreTool = defineTool({
  name: "record_score",
  description: "Record the score of a squash session between two players (e.g. Jason 3 - 1 Amp).",
  parameters: Type.Object({
    date: Type.String({ description: "Date of the session in YYYY-MM-DD format", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    player1: Type.String({ description: "Name of first player" }),
    player2: Type.String({ description: "Name of second player" }),
    score1: Type.Number({ description: "Number of games won by player1" }),
    score2: Type.Number({ description: "Number of games won by player2" }),
  }),
  execute: async (args) => {
    const entry = await recordScore(args.date, args.player1, args.player2, args.score1, args.score2);
    logger.info("Tool: record_score", { id: entry.id });
    return text(`Score recorded: ${entry.player1} ${entry.score1} - ${entry.score2} ${entry.player2} on ${entry.date}`);
  },
});

const listScoresTool = defineTool({
  name: "list_scores",
  description: "Show recent squash session scores.",
  parameters: Type.Object({
    limit: Type.Optional(Type.Number({ description: "Number of recent scores to show (default 10)" })),
  }),
  execute: async (args) => {
    const entries = await listScores(args.limit);
    if (entries.length === 0) return text("No scores recorded yet.");
    return json(entries);
  },
});

const listCourtPreferencesTool = defineTool({
  name: "list_court_preferences",
  description: "Show which courts are preferred and which are avoided when booking.",
  parameters: Type.Object({}),
  execute: async () => {
    const preferences = await listCourtPreferences();
    if (preferences.length === 0) return text("No court preferences set — all courts are treated equally.");
    return json(preferences);
  },
});

const setCourtPreferenceTool = defineTool({
  name: "set_court_preference",
  description:
    "Set how much a court is favoured when several are free at the same time. Use when someone says they like or dislike a court.",
  parameters: Type.Object({
    court: Type.String({ description: 'Court name or number, e.g. "Baan 12" or "12"' }),
    tier: Type.Union([Type.Literal("preferred"), Type.Literal("neutral"), Type.Literal("avoided")], {
      description: "preferred = book first, avoided = book only as last resort, neutral = no preference",
    }),
  }),
  execute: async (args) => {
    const court = normalizeCourtName(args.court);
    if (!court) {
      return text(`"${args.court}" is not a court name. Courts are named Baan 1 through Baan 13.`);
    }

    await setCourtTier(court, args.tier);
    logger.info("Tool: set_court_preference", { court, tier: args.tier });
    return text(`${court} is now ${args.tier}.`);
  },
});

function createSendMessageTool(bot: Bot) {
  return defineTool({
    name: "send_message",
    description:
      "Send a message to the chat. This is the only way anyone sees what you say, and it ends your turn, so call it last, on its own.",
    parameters: Type.Object({
      text: Type.String({ description: "The message, in plain text" }),
      reply_to: Type.Optional(
        Type.Number({ description: "Message number to reply to, when it helps to make clear what you answer" }),
      ),
    }),
    execute: async (args, api, context) => {
      // Models sometimes "stay quiet" by sending nothing; Telegram rejects empty messages.
      if (!args.text.trim()) {
        return { ...text("Nothing sent."), control: { terminate: true } };
      }

      const chatId = await getChatId(api, api.conversationId, context);
      const replyParameters = args.reply_to ? { reply_parameters: { message_id: args.reply_to } } : {};
      // Plain text only: no parse_mode. Trevor formats with line breaks, bullets and emoji.
      const sent = await bot.api.sendMessage(chatId, args.text, replyParameters);
      logger.info("Tool: send_message", { chatId, messageId: sent.message_id, length: args.text.length });

      return { ...text(`Sent as message ${sent.message_id}.`), control: { terminate: true } };
    },
  });
}

/**
 * Wraps a tool that does real work: logs how it went, and shows "typing…" in the chat while it runs.
 * Telegram clears that status after ~5s, so it is refreshed until the tool is done.
 */
function instrument<TParameters extends TSchema>(
  bot: Bot,
  tool: ToolRegistration<TParameters>,
): ToolRegistration<TParameters> {
  return {
    ...tool,
    execute: async (args, api, context) => {
      const chatId = await getChatId(api, api.conversationId, context);
      const sendTyping = () => bot.api.sendChatAction(chatId, "typing").catch(() => {});
      sendTyping();
      const interval = setInterval(sendTyping, TYPING_REFRESH_MS);
      const elapsed = logger.time();

      try {
        const result = await tool.execute(args, api, context);
        logger.info(`Tool: ${tool.name} done`, { chatId, latencyMs: elapsed() });
        return result;
      } catch (error) {
        logger.error(`Tool: ${tool.name} failed`, { chatId, args, latencyMs: elapsed(), error });
        throw error;
      } finally {
        clearInterval(interval);
      }
    },
  };
}

export function createTools(bot: Bot): ToolRegistration[] {
  const workTools: ToolRegistration[] = [
    checkAvailability,
    bookCourt,
    listMyReservations,
    cancelReservationTool,
    addToQueueTool,
    listQueue,
    removeFromQueueTool,
    addRecurringBookingTool,
    listRecurringBookingsTool,
    stopRecurringBookingTool,
    recordScoreTool,
    listScoresTool,
    listCourtPreferencesTool,
    setCourtPreferenceTool,
  ];

  return [...workTools.map((tool) => instrument(bot, tool)), createSendMessageTool(bot)];
}
