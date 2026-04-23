import { describe, expect, test } from "bun:test";

import { getSystemPrompt } from "./system-prompt";

describe("getSystemPrompt", () => {
  test("uses the provided current date instead of a stale module-level value", () => {
    const marchPrompt = getSystemPrompt(new Date("2026-03-17T12:00:00Z"));
    const aprilPrompt = getSystemPrompt(new Date("2026-04-23T12:00:00Z"));

    expect(marchPrompt).toContain("(2026-03-17)");
    expect(aprilPrompt).toContain("(2026-04-23)");
    expect(aprilPrompt).not.toBe(marchPrompt);
  });
});
