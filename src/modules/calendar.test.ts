import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "trevor-calendar-"));
Object.assign(Bun.env, {
  DATA_DIR: dataDir,
  SQUASH_CITY_USERNAME: "test",
  SQUASH_CITY_PASSWORD: "test",
  TELEGRAM_BOT_TOKEN: "test",
  TELEGRAM_CHAT_ID: "1",
  ANTHROPIC_API_KEY: "test",
  FASTMAIL_BASE_URL: "",
});

const { db, migrateDatabase, closeDatabase } = await import("@/db");
const { calendarEvents } = await import("@/db/schema");
const { cancelBooking, cancelPlaceholders, confirmBooking, createPlaceholder } = await import("@/modules/calendar");
const { eq } = await import("drizzle-orm");

async function eventWithId(id: string) {
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, Number(id)));
  return event;
}

beforeAll(() => {
  migrateDatabase();
});

afterAll(() => {
  closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("calendar invites", () => {
  test("a placeholder becomes the booked court, as a new version of the same event", async () => {
    const id = await createPlaceholder("2026-11-10", "18:30", "19:30");
    expect(await eventWithId(id)).toMatchObject({ court: null, sequence: 0, sentSequence: 0 });

    await confirmBooking({ calendarEventId: id, courtName: "Court 3", date: "2026-11-10", time: "18:45" });

    expect(await eventWithId(id)).toMatchObject({
      court: "Court 3",
      timeFrom: "18:45",
      timeTo: "19:30",
      sequence: 1,
      sentSequence: 1,
      cancelledAt: null,
    });
  });

  test("a court already in the calendar only withdraws the placeholder", async () => {
    await confirmBooking({ calendarEventId: null, courtName: "Court 5", date: "2026-11-11", time: "18:30" });
    const id = await createPlaceholder("2026-11-11", "18:00", "19:00");

    await confirmBooking({ calendarEventId: id, courtName: "Court 5", date: "2026-11-11", time: "18:30" });

    expect((await eventWithId(id)).cancelledAt).not.toBeNull();
    const courts = await db.select().from(calendarEvents).where(eq(calendarEvents.date, "2026-11-11"));
    expect(courts.filter((event) => event.court === "Court 5" && !event.cancelledAt)).toHaveLength(1);
  });

  test("withdrawing a request cancels its placeholder, but never a booked court", async () => {
    const placeholder = await createPlaceholder("2026-11-12", "18:00", "19:00");
    const booked = await createPlaceholder("2026-11-12", "20:00", "21:00");
    await confirmBooking({ calendarEventId: booked, courtName: "Court 1", date: "2026-11-12", time: "20:00" });

    await cancelPlaceholders([placeholder, booked, null, "google-event-id"]);

    expect(await eventWithId(placeholder)).toMatchObject({ sequence: 1, sentSequence: 1 });
    expect((await eventWithId(placeholder)).cancelledAt).not.toBeNull();
    expect((await eventWithId(booked)).cancelledAt).toBeNull();
  });

  test("cancelling a reservation cancels its court", async () => {
    await confirmBooking({ calendarEventId: null, courtName: "Court 2", date: "2026-11-13", time: "19:00" });

    await cancelBooking("2026-11-13", "19:00");

    const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.date, "2026-11-13"));
    expect(event).toMatchObject({ court: "Court 2", sequence: 1, sentSequence: 1 });
    expect(event.cancelledAt).not.toBeNull();
  });
});
