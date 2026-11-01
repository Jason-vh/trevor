import ical, { ICalAttendeeRole, ICalAttendeeStatus, ICalCalendarMethod, ICalEventStatus } from "ical-generator";
import { createTransport } from "nodemailer";

import type { calendarEvents } from "@/db/schema";
import { ACCOUNT_OWNER, PLAYERS } from "@/players";
import { APP_TIME_ZONE, zonedTimeToUtc } from "@/utils/datetime";

export const INVITE_SENDER = { name: "Trevor", email: "trevor@vhtm.eu" };
const LOCATION = "SquashCity";
const UID_DOMAIN = "trevor.vhtm.eu";

export type CalendarEvent = typeof calendarEvents.$inferSelect;

const composer = createTransport({ streamTransport: true, buffer: true, newline: "windows" });

function recipients() {
  return [ACCOUNT_OWNER, ...PLAYERS].map((player) => ({ name: player.name, email: player.email }));
}

function title(event: CalendarEvent) {
  return event.court ? `squash! ${event.court.toLowerCase()}` : "squash! (placeholder)";
}

function formatWhen(event: CalendarEvent) {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(zonedTimeToUtc(event.date, event.timeFrom));
  return `${day}, ${event.timeFrom}–${event.timeTo}`;
}

function bodyText(event: CalendarEvent) {
  if (event.cancelledAt) return "This squash is off.";
  if (event.court) return `Trevor booked ${event.court}.`;
  return `Trevor is looking for a court between ${event.timeFrom} and ${event.timeTo}, and will update this once he has one.`;
}

function calendarFile(event: CalendarEvent, method: ICalCalendarMethod) {
  let status = ICalEventStatus.TENTATIVE;
  if (event.court) status = ICalEventStatus.CONFIRMED;
  if (event.cancelledAt) status = ICalEventStatus.CANCELLED;

  const calendar = ical({ prodId: { company: "vhtm.eu", product: "Trevor", language: "EN" }, method });
  calendar.createEvent({
    id: `${event.id}@${UID_DOMAIN}`,
    sequence: event.sequence,
    stamp: new Date(),
    start: zonedTimeToUtc(event.date, event.timeFrom),
    end: zonedTimeToUtc(event.date, event.timeTo),
    summary: title(event),
    location: LOCATION,
    status,
    organizer: INVITE_SENDER,
    attendees: recipients().map((recipient) => ({
      ...recipient,
      role: ICalAttendeeRole.REQ,
      status: ICalAttendeeStatus.NEEDSACTION,
      rsvp: method === ICalCalendarMethod.REQUEST,
    })),
  });
  return calendar.toString();
}

/** The whole email for the event's current state: a text body with the calendar event as its alternative. */
export async function composeInvite(event: CalendarEvent): Promise<Buffer> {
  const method = event.cancelledAt ? ICalCalendarMethod.CANCEL : ICalCalendarMethod.REQUEST;
  const subject = `${title(event)}, ${formatWhen(event)}`;
  const { message } = await composer.sendMail({
    from: { name: INVITE_SENDER.name, address: INVITE_SENDER.email },
    to: recipients().map((recipient) => ({ name: recipient.name, address: recipient.email })),
    subject: event.cancelledAt ? `Cancelled: ${subject}` : subject,
    text: bodyText(event),
    icalEvent: { method, content: calendarFile(event, method) },
  });
  if (!Buffer.isBuffer(message)) throw new Error("The email was composed as a stream");
  return message;
}
