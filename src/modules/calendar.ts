import { PLAYERS } from "@/players";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";

async function postToCalendar(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!config.calendarWebhookUrl) return null;

  try {
    const response = await fetch(config.calendarWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, attendees: PLAYERS.map((p) => p.email) }),
      redirect: "follow",
    });
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    logger.warn("Calendar: webhook request failed", { error });
    return null;
  }
}

function confirmedTitle(courtName: string): string {
  return `squash! ${courtName.toLowerCase()}`;
}

export async function createTentativeEvent(date: string, timeFrom: string, timeTo: string): Promise<string | null> {
  const result = await postToCalendar({
    action: "createTentative",
    title: "squash! (placeholder)",
    date,
    timeFrom,
    timeTo,
  });
  if (!result) return null;
  return (result["eventId"] as string) ?? null;
}

export async function confirmEvent(eventId: string, courtName: string, date: string, time: string): Promise<void> {
  await postToCalendar({ action: "confirm", title: confirmedTitle(courtName), eventId, date, time });
}

export async function createConfirmedEvent(courtName: string, date: string, time: string): Promise<void> {
  await postToCalendar({ action: "createConfirmed", title: confirmedTitle(courtName), date, time });
}
