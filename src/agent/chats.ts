import type { Context } from "@earendil-works/chord";
import { type ConversationId, defineDoc, type DocumentReader } from "@earendil-works/pi-durable";

/** Which conversation belongs to which Telegram chat. */
export const ChatsDoc = defineDoc<{ conversations: Record<string, number> }>({
  kind: "trevor.chats",
  version: 1,
  scope: "session",
  initial: () => ({ conversations: {} }),
});

/** The Telegram chat a conversation talks to. */
export const ChatDoc = defineDoc<{ chatId: string }>({
  kind: "trevor.chat",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ chatId: "" }),
});

export async function getChatId(
  read: DocumentReader,
  conversationId: ConversationId,
  context: Context,
): Promise<string> {
  const chat = await read.snapshot(ChatDoc, conversationId, context);
  if (!chat?.chatId) throw new Error(`Conversation ${conversationId} has no Telegram chat`);
  return chat.chatId;
}
