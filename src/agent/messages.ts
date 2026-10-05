import { formatMessageTime } from "@/utils/datetime";

export type ChatMessage = {
  chatId: string;
  messageId: number;
  sender: string;
  text: string;
  /** @mentions Trevor, replies to him, or is in a private chat with him: the messages that wake him. */
  addressedToTrevor: boolean;
  sentAt: Date;
  replyTo?: { messageId: number; sender: string };
};

/** How a Telegram message reads to Trevor: who sent it, when, and what it replies to. */
export function formatChatMessage(message: ChatMessage): string {
  const details = [`message ${message.messageId} from ${message.sender}`, formatMessageTime(message.sentAt)];
  if (message.replyTo) {
    details.push(`replying to message ${message.replyTo.messageId} from ${message.replyTo.sender}`);
  }
  if (message.addressedToTrevor) {
    details.push("to you");
  }
  return `[${details.join(", ")}]\n${message.text}`;
}

export function formatNotice(text: string): string {
  return `[notice]\n${text}`;
}

export function formatTask(text: string): string {
  return `[scheduled task]\n${text}`;
}
