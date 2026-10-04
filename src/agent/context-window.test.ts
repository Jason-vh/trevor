import { describe, expect, test } from "bun:test";

import type { Message } from "@earendil-works/pi-ai";

import { keepRecentMessages } from "./context-window";

const system = (text: string): Message => ({ role: "system", content: text, timestamp: 0 });
const user = (text: string): Message => ({ role: "user", content: text, timestamp: 0 });
const assistant = (text: string): Message =>
  ({ role: "assistant", content: [{ type: "text", text }] }) as unknown as Message;
const toolResult = (text: string): Message =>
  ({ role: "toolResult", toolCallId: text, content: [{ type: "text", text }] }) as unknown as Message;

const describeMessage = (message: Message) => {
  if (typeof message.content === "string") return message.content;
  const [first] = message.content;
  return first?.type === "text" ? first.text : "";
};

describe("keepRecentMessages", () => {
  test("keeps everything when there are few enough user messages", () => {
    const messages = [system("prompt"), user("a"), assistant("A"), user("b")];
    expect(keepRecentMessages(messages, 2)).toBe(messages);
  });

  test("starts at the oldest user message to keep, with what followed it", () => {
    const messages = [
      system("prompt"),
      user("a"),
      assistant("A"),
      user("b"),
      assistant("B"),
      toolResult("B'"),
      user("c"),
    ];

    expect(keepRecentMessages(messages, 2).map(describeMessage)).toEqual(["prompt", "b", "B", "B'", "c"]);
  });

  test("keeps system messages from before the cut, in order", () => {
    const messages = [system("prompt"), user("a"), system("update"), user("b"), system("later"), user("c")];

    expect(keepRecentMessages(messages, 1).map(describeMessage)).toEqual(["prompt", "update", "later", "c"]);
  });
});
