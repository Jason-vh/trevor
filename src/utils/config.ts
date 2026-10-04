export interface Config {
  squashCityCredentials: {
    username: string;
    password: string;
  };

  telegram: {
    token: string;
    chatIds: Set<string>;
    groupChatIds: Set<string>;
  };

  anthropic: {
    apiKey: string;
  };

  /** SQLite file holding the queue, scores, court preferences and metadata. */
  databasePath: string;

  /** SQLite file holding Trevor's conversations. */
  conversationsPath: string;

  calendarWebhookUrl?: string;

  webhook?: {
    domain: string;
    secret: string;
  };
}

if (!Bun.env.SQUASH_CITY_USERNAME || !Bun.env.SQUASH_CITY_PASSWORD) {
  throw new Error("Missing SquashCity credentials");
}

if (!Bun.env.TELEGRAM_BOT_TOKEN || !Bun.env.TELEGRAM_CHAT_ID) {
  throw new Error("Missing Telegram configuration");
}

if (!Bun.env.ANTHROPIC_API_KEY) {
  throw new Error("Missing ANTHROPIC_API_KEY");
}

const dataDir = Bun.env.DATA_DIR || "data";
const chatIds = new Set(Bun.env.TELEGRAM_CHAT_ID.split(",").map((id) => id.trim()));
const groupChatIds = new Set([...chatIds].filter((id) => id.startsWith("-")));

export const config: Config = {
  squashCityCredentials: {
    username: Bun.env.SQUASH_CITY_USERNAME,
    password: Bun.env.SQUASH_CITY_PASSWORD,
  },
  telegram: {
    token: Bun.env.TELEGRAM_BOT_TOKEN,
    chatIds,
    groupChatIds,
  },
  anthropic: {
    apiKey: Bun.env.ANTHROPIC_API_KEY,
  },
  databasePath: `${dataDir}/trevor.db`,
  conversationsPath: `${dataDir}/conversations.db`,
  calendarWebhookUrl: Bun.env.CALENDAR_WEBHOOK_URL,
  webhook: Bun.env.WEBHOOK_DOMAIN
    ? {
        domain: Bun.env.WEBHOOK_DOMAIN,
        secret: Bun.env.WEBHOOK_SECRET || "",
      }
    : undefined,
};
