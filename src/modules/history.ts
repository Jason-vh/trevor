import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { messages } from "@/db/schema";

import type { AssistantMessage, Message, UserMessage } from "@mariozechner/pi-ai";

const MAX_HISTORY_MESSAGES = 20;

const DUMMY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export async function saveMessage(chatId: string, role: string, content: string): Promise<void> {
  await db.insert(messages).values({ chatId, role, content });
}

export async function loadHistory(chatId: string): Promise<Message[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.createdAt))
    .limit(MAX_HISTORY_MESSAGES);

  // Reverse to chronological order
  rows.reverse();

  return rows.map((row): Message => {
    const timestamp = row.createdAt.getTime();

    if (row.role === "user") {
      return {
        role: "user",
        content: row.content as string,
        timestamp,
      } satisfies UserMessage;
    }

    return {
      role: "assistant",
      content: [{ type: "text", text: row.content as string }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      usage: DUMMY_USAGE,
      stopReason: "stop",
      timestamp,
    } satisfies AssistantMessage;
  });
}
