import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

import { loadHistory, saveMessage } from "@/modules/history";
import { config } from "@/utils/config";
import { logger } from "@/utils/logger";
import { SYSTEM_PROMPT } from "./system-prompt";
import { tools } from "./tools";

const model = getModel("anthropic", "claude-sonnet-4-6");

export async function runAgent(chatId: string, userMessage: string): Promise<string> {
  const history = await loadHistory(chatId);

  logger.info("Running agent", { chatId, historyLength: history.length });

  const elapsed = logger.time();

  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      tools,
      messages: history,
    },
    getApiKey: (provider) => {
      if (provider === "anthropic") return config.anthropic.apiKey;
      return undefined;
    },
  });

  await agent.prompt(userMessage);
  await agent.waitForIdle();

  // Extract text from the last assistant message, and collect tool-use blocks
  const allMessages = agent.state.messages;
  let responseText = "";
  const toolsInvoked: string[] = [];

  for (const msg of allMessages) {
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "tool_use") {
          toolsInvoked.push(part.name);
        }
      }
    }
  }

  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msg = allMessages[i];
    if (msg.role === "assistant") {
      const textParts = msg.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text);
      responseText = textParts.join("\n");
      break;
    }
  }

  // Save user message and assistant response to DB
  await saveMessage(chatId, "user", userMessage);
  if (responseText) {
    await saveMessage(chatId, "assistant", responseText);
  }

  logger.info("Agent completed", {
    chatId,
    toolCallCount: toolsInvoked.length,
    toolsCalled: toolsInvoked,
    responseLength: responseText.length,
    latencyMs: elapsed(),
  });

  return responseText || "I couldn't generate a response. Please try again.";
}
