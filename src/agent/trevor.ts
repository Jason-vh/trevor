import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import {
  type Conversation,
  type ConversationId,
  createRegistry,
  defineExtension,
  GenerationTask,
  Harness,
  hook,
  type ModelRef,
  section,
  type Submission,
} from "@earendil-works/pi-durable";
import type { Bot } from "grammy";

import { ChatDoc, ChatsDoc, getChatId } from "@/agent/chats";
import { keepRecentMessages } from "@/agent/context-window";
import { type ChatMessage, formatChatMessage, formatNotice, formatTask } from "@/agent/messages";
import { openConversationStorage } from "@/agent/storage";
import { GROUP_CHAT, PRIVATE_CHAT, SYSTEM_PROMPT } from "@/agent/system-prompt";
import { createTools } from "@/agent/tools";
import { logger } from "@/utils/logger";

const context = BACKGROUND_CONTEXT;

const MODEL: ModelRef = { provider: "anthropic", modelId: "claude-sonnet-5-5" };
const THINKING_LEVEL = "low";

// Trevor reads every message in a group, so the chat grows quickly: keep requests small by sending
// only the most recent messages rather than the whole chat.
const RECENT_MESSAGES = 20;

export interface Trevor {
  /** Durably hands a chat message meant for Trevor to him. He works on it in the background and answers through send_message. */
  receive(message: ChatMessage): Promise<Submission>;
  /** Adds a chat message that isn't meant for Trevor to his conversation, without waking him. */
  overhear(message: ChatMessage): Promise<void>;
  /** Tells Trevor about something that happened outside the chat, without asking him to act on it. */
  notice(chatId: string, text: string): Promise<void>;
  /**
   * Asks Trevor to do something in a chat on the app's behalf, such as the morning reminder.
   * `requestId` makes it happen once, however often it is asked.
   */
  assign(chatId: string, task: string, requestId: string): Promise<Submission>;
  close(): Promise<void>;
}

export async function startTrevor(bot: Bot, storagePath: string): Promise<Trevor> {
  const models = createModels();
  models.setProvider(anthropicProvider());

  if (!models.getModel(MODEL.provider, MODEL.modelId)) {
    throw new Error(`Unknown model ${MODEL.provider}/${MODEL.modelId}`);
  }

  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "trevor",
      tools: createTools(bot),
      sections: [
        section("trevor", () => SYSTEM_PROMPT, { tag: false }),
        section("chat", async (input, renderContext) => {
          const chatId = await getChatId(input.read, input.conversationId, renderContext);
          // Telegram gives groups negative IDs.
          return chatId.startsWith("-") ? GROUP_CHAT : PRIVATE_CHAT;
        }),
      ],
      hooks: [
        hook(GenerationTask, {
          beforeRequest: ({ messages }) => ({ messages: keepRecentMessages(messages, RECENT_MESSAGES) }),
        }),
      ],
    }),
  );

  const harness = await Harness.open(
    await openConversationStorage(storagePath),
    {
      models,
      registry,
      settings: {
        // Messages that arrive while Trevor works join that work at the next step, all at once.
        steeringMode: "all",
        followUpMode: "all",
        // The context window below keeps requests small, so there is nothing to summarize.
        compaction: { enabled: false },
      },
      onReport: (error) => logger.error("Trevor: extension failure", { error }),
    },
    context,
  );

  const agent = { model: MODEL, thinkingLevel: THINKING_LEVEL } as const;

  async function findOrCreateConversation(chatId: string): Promise<Conversation> {
    const chats = await harness.snapshot(ChatsDoc, context);
    const conversationId = chats?.conversations[chatId];

    if (conversationId !== undefined) {
      const conversation = await harness.conversation(conversationId as ConversationId, context);
      if (conversation) return conversation;
    }

    logger.info("Trevor: starting a conversation", { chatId });
    return harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent,
        init: async (tx, id) => {
          (await tx.doc(ChatsDoc)).conversations[chatId] = id;
          (await tx.doc(ChatDoc, id)).chatId = chatId;
        },
      },
      context,
    );
  }

  // One lookup per chat, so messages arriving together never create two conversations.
  const conversations = new Map<string, Promise<Conversation>>();

  function conversationFor(chatId: string): Promise<Conversation> {
    let conversation = conversations.get(chatId);
    if (!conversation) {
      conversation = findOrCreateConversation(chatId);
      conversations.set(chatId, conversation);
      conversation.catch(() => conversations.delete(chatId));
    }
    return conversation;
  }

  // Conversations store their model, so move existing ones to the current one.
  const chats = await harness.snapshot(ChatsDoc, context);
  for (const chatId of Object.keys(chats?.conversations ?? {})) {
    await (await conversationFor(chatId)).configure(agent, context);
  }

  // Pick up whatever the previous process left unfinished.
  harness.resume();

  return {
    async receive(message) {
      const conversation = await conversationFor(message.chatId);
      return conversation.submit(
        {
          type: "input",
          content: formatChatMessage(message),
          requestId: `telegram:${message.messageId}`,
          whenBusy: "steer",
        },
        context,
      );
    },

    async overhear(message) {
      const conversation = await conversationFor(message.chatId);
      await conversation.submit(
        {
          type: "write",
          entry: {
            kind: "trevor.chat_message",
            model: [{ role: "user", content: formatChatMessage(message), timestamp: message.sentAt.getTime() }],
          },
          requestId: `telegram:${message.messageId}`,
        },
        context,
      );
    },

    async notice(chatId, text) {
      const conversation = await conversationFor(chatId);
      await conversation.submit(
        {
          type: "write",
          entry: {
            kind: "trevor.notice",
            model: [{ role: "user", content: formatNotice(text), timestamp: Date.now() }],
          },
        },
        context,
      );
    },

    async assign(chatId, task, requestId) {
      const conversation = await conversationFor(chatId);
      return conversation.submit({ type: "input", content: formatTask(task), requestId }, context);
    },

    close: () => harness.close(context),
  };
}
