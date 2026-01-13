import { generateText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { buildMessage } from "@/modules/notify";
import { fetchAvailabilityForDates } from "@/services/availability";
import { createMonitor, listMonitorsForChat, summarizeMonitor } from "@/monitors/service";
import { Weekday, type CourtAvailability } from "@/types";
import { config } from "@/utils/config";
import { getUpcomingDatesForWeekdays, normalizeISODate, toISODate } from "@/utils/datetime";
import { logger } from "@/utils/logger";
import { mergeGroupedSlots } from "@/utils/slots";

const SYSTEM_PROMPT = `
You are Trevor, an AI helper whose only focus is squash court availability at SquashCity in Amsterdam.
Use the provided tools whenever the user asks for:
- Checking availability for specific days/times (use checkAvailability).
- Setting up or modifying ongoing monitoring rules (use createMonitor).
- Reviewing what is already being monitored (use listMonitors).

Guidelines:
- Keep answers short, structured, and confident.
- Always mention the relevant dates and 24h times.
- If no availability exists, say so clearly and offer to monitor or try another window.
- When the user references natural language dates like "next Tuesday", convert them to weekdays via the tool input.
- When the user references explicit calendar dates, convert them to ISO format (YYYY-MM-DD) before calling a tool.
- Confirm monitor details after creation so the user knows what will be watched.
- Stay on-topic: only discuss squash availability, monitoring, or Telegram notifications.
`.trim();

const openaiProvider = createOpenAI({
  apiKey: config.openAI.apiKey,
});

const WEEKDAY_VALUES = Object.values(Weekday) as [Weekday, ...Weekday[]];
const WEEKDAY_ENUM = z.enum(WEEKDAY_VALUES);

interface AgentContext {
  chatId: string;
  message: string;
  username?: string;
}

function deduplicateDates(dates: string[]): string[] {
  return Array.from(new Set(dates));
}

export async function runAgent({ chatId, message, username }: AgentContext): Promise<string> {
  const checkAvailabilityParameters = z.object({
    fromTime: z.string().describe("Start time in 24h HH:MM format").default("17:00"),
    toTime: z.string().describe("End time in 24h HH:MM format").default("21:00"),
    dates: z.array(z.string()).describe("Exact ISO dates in YYYY-MM-DD format").optional(),
    daysOfWeek: z.array(WEEKDAY_ENUM).describe("Weekday names like mon/tue/wed").optional(),
  });

  const checkAvailabilityTool = tool({
    description: "Look up squash court availability for given dates or weekdays and a time window.",
    inputSchema: checkAvailabilityParameters,
    execute: async (args: z.infer<typeof checkAvailabilityParameters>) => {
      const { fromTime, toTime, dates, daysOfWeek } = args;

      const normalizedDates = dates?.map(normalizeISODate) ?? [];
      const computedDates =
        normalizedDates.length > 0
          ? normalizedDates
          : daysOfWeek && daysOfWeek.length > 0
            ? getUpcomingDatesForWeekdays(daysOfWeek as Weekday[], config.monitoring.lookaheadDays)
            : [toISODate(new Date())];

      const availability = await fetchAvailabilityForDates({
        dates: deduplicateDates(computedDates),
        fromTime,
        toTime,
      });

      const aggregate = new Map<string, Map<string, CourtAvailability[]>>();
      for (const daily of availability) {
        mergeGroupedSlots(aggregate, daily.grouped);
      }

      if (aggregate.size === 0) {
        return `No available squash courts found between ${fromTime} and ${toTime} for the requested dates.`;
      }

      const heading = `Here is what I found for ${computedDates.join(", ")}`;
      return buildMessage(aggregate, heading);
    },
  });

  const createMonitorParameters = z
    .object({
      description: z.string().describe("Short human description").optional(),
      fromTime: z.string().describe("Start time like 17:00").default("17:00"),
      toTime: z.string().describe("End time like 20:00").default("20:00"),
      dates: z.array(z.string()).describe("ISO dates YYYY-MM-DD").optional(),
      daysOfWeek: z.array(WEEKDAY_ENUM).describe("Weekday short codes").optional(),
    })
    .refine((data) => data.dates?.length || data.daysOfWeek?.length, {
      message: "Specify at least one ISO date or weekday to monitor.",
    });

  const createMonitorTool = tool({
    description:
      "Create or update an automated monitor so Trevor can ping the user whenever new courts appear for specified dates or weekdays.",
    inputSchema: createMonitorParameters,
    execute: async (args: z.infer<typeof createMonitorParameters>) => {
      const { description, fromTime, toTime, dates, daysOfWeek } = args;
      const monitor = await createMonitor({
        chatId,
        description,
        fromTime,
        toTime,
        dates: dates?.map(normalizeISODate),
        daysOfWeek: daysOfWeek as Weekday[] | undefined,
      });

      return `Monitor ${monitor.id} created for ${fromTime}-${toTime}. ${summarizeMonitor(monitor)}`;
    },
  });

  const listMonitorsParameters = z.object({
    includeInactive: z.boolean().default(false),
  });

  const listMonitorsTool = tool({
    description: "List the active or inactive monitors for the chat.",
    inputSchema: listMonitorsParameters,
    execute: async (args: z.infer<typeof listMonitorsParameters>) => {
      const { includeInactive } = args;
      const monitors = await listMonitorsForChat(chatId, { includeInactive });
      if (monitors.length === 0) {
        return "There are no saved monitors yet.";
      }

      const heading = includeInactive ? "All monitors:" : "Active monitors:";
      const summary = monitors.map((monitor) => `${monitor.active ? "🟢" : "⚪️"} ${summarizeMonitor(monitor)}`).join("\n");
      return `${heading}\n${summary}`;
    },
  });

  try {
    const userInfo = username ? `The request comes from Telegram user @${username}.` : "";
    const result = await generateText({
      model: openaiProvider(config.openAI.model),
      system: `${SYSTEM_PROMPT}\n${userInfo}`.trim(),
      prompt: message,
      tools: {
        checkAvailability: checkAvailabilityTool,
        createMonitor: createMonitorTool,
        listMonitors: listMonitorsTool,
      },
    });

    return result.text.trim();
  } catch (error) {
    logger.error("Agent failed", { error });
    return "I ran into an issue while thinking about that. Can you try again in a minute?";
  }
}
