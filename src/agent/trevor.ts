import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import {
  type Conversation,
  type ConversationId,
  createRegistry,
  defineExtension,
  Harness,
  type ModelRef,
  section,
  type Submission,
} from "@earendil-works/pi-durable";
import type { Bot } from "grammy";

import { ChatDoc, ChatsDoc, getChatId } from "@/agent/chats";
import { type ChatMessage, formatChatMessage, formatNotice } from "@/agent/messages";
import { openConversationStorage } from "@/agent/storage";
import { GROUP_CHAT, PRIVATE_CHAT, SYSTEM_PROMPT } from "@/agent/system-prompt";
import { createTools } from "@/agent/tools";
import { logger } from "@/utils/logger";

const context = BACKGROUND_CONTEXT;

const MODEL: ModelRef = { provider: "anthropic", modelId: "claude-sonnet-5-5" };
const THINKING_LEVEL = "low";

// Every request carries the chat's whole active context, so keep it small: once it grows past
// this many tokens, older messages are compacted into a summary.
const MAX_CONTEXT_TOKENS = 50_000;
const KEEP_RECENT_TOKENS = 15_000;
const BACKGROUND_COMPACTION_TOKENS = 10_000;

export interface Trevor {
  /** Durably hands a chat message to Trevor. He works on it in the background and answers through send_message. */
  receive(message: ChatMessage): Promise<Submission>;
  /** Tells Trevor about something that happened outside the chat, without asking him to act on it. */
  notice(chatId: string, text: string): Promise<void>;
  close(): Promise<void>;
}

export async function startTrevor(bot: Bot, storagePath: string): Promise<Trevor> {
  const models = createModels();
  models.setProvider(anthropicProvider());

  const model = models.getModel(MODEL.provider, MODEL.modelId);
  if (!model) throw new Error(`Unknown model ${MODEL.provider}/${MODEL.modelId}`);

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
        compaction: {
          reserveTokens: model.contextWindow - MAX_CONTEXT_TOKENS,
          keepRecentTokens: KEEP_RECENT_TOKENS,
          backgroundTokens: BACKGROUND_COMPACTION_TOKENS,
        },
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

    close: () => harness.close(context),
  };
}
