import { describe, expect, test } from "bun:test";

import { formatChatMessage } from "./messages";

const message = {
  chatId: "-100",
  messageId: 12,
  sender: "Jan",
  text: "please book that",
  addressedToTrevor: false,
  sentAt: new Date("2026-07-21T16:05:00Z"),
};

describe("formatChatMessage", () => {
  test("says who sent the message and when", () => {
    expect(formatChatMessage(message)).toBe("[message 12 from Jan, Tue 21 Jul 2026 18:05]\nplease book that");
  });

  test("marks replies and messages addressed to Trevor", () => {
    const reply = { ...message, addressedToTrevor: true, replyTo: { messageId: 11, sender: "Trevor" } };

    expect(formatChatMessage(reply)).toBe(
      "[message 12 from Jan, Tue 21 Jul 2026 18:05, replying to message 11 from Trevor, to you]\nplease book that",
    );
  });
});
