import { describe, expect, test } from "bun:test";

import { projectWeeklySessions } from "./upcoming-sessions";

const tuesdays = { id: 1, weekday: "tuesday", timeFrom: "18:30", timeTo: "19:00" };

describe("projectWeeklySessions", () => {
  test("lists every matching weekday in the range", () => {
    const sessions = projectWeeklySessions([tuesdays], new Map(), "2026-11-09", "2026-11-30");

    expect(sessions.map((session) => session.date)).toEqual(["2026-11-10", "2026-11-17", "2026-11-24"]);
    expect(sessions[0]).toEqual({
      date: "2026-11-10",
      timeFrom: "18:30",
      timeTo: "19:00",
      court: null,
      status: "weekly",
    });
  });

  test("leaves out weeks that were queued, so a removed week stays skipped", () => {
    const queued = new Map([[1, new Set(["2026-11-17"])]]);

    const sessions = projectWeeklySessions([tuesdays], queued, "2026-11-09", "2026-11-30");

    expect(sessions.map((session) => session.date)).toEqual(["2026-11-10", "2026-11-24"]);
  });

  test("only skips weeks queued by the same weekly booking", () => {
    const queued = new Map([[2, new Set(["2026-11-17"])]]);

    const sessions = projectWeeklySessions([tuesdays], queued, "2026-11-09", "2026-11-30");

    expect(sessions).toHaveLength(3);
  });
});
