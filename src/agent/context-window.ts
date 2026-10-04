import type { Message } from "@earendil-works/pi-ai";

/**
 * Keeps the model's context to the last `count` chat messages (and notices), with everything Trevor
 * did since. The system prompt travels as `system` messages in the transcript, so those all stay.
 *
 * The cut always falls on a user message, so a tool call is never separated from its result.
 */
export function keepRecentMessages(messages: readonly Message[], count: number): readonly Message[] {
  const userIndexes = messages.flatMap((message, index) => (message.role === "user" ? [index] : []));
  if (userIndexes.length <= count) return messages;

  const start = userIndexes[userIndexes.length - count];
  const earlierSystemMessages = messages.slice(0, start).filter((message) => message.role === "system");

  return [...earlierSystemMessages, ...messages.slice(start)];
}
