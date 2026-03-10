export interface Config {
  squashCityCredentials: {
    username: string;
    password: string;
  };

  telegram: {
    token: string;
    chatIds: Set<string>;
  };

  anthropic: {
    apiKey: string;
  };

  databaseUrl: string;

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

if (!Bun.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL");
}

export const config: Config = {
  squashCityCredentials: {
    username: Bun.env.SQUASH_CITY_USERNAME,
    password: Bun.env.SQUASH_CITY_PASSWORD,
  },
  telegram: {
    token: Bun.env.TELEGRAM_BOT_TOKEN,
    chatIds: new Set(Bun.env.TELEGRAM_CHAT_ID.split(",").map((id) => id.trim())),
  },
  anthropic: {
    apiKey: Bun.env.ANTHROPIC_API_KEY,
  },
  databaseUrl: Bun.env.DATABASE_URL,
  calendarWebhookUrl: Bun.env["CALENDAR_WEBHOOK_URL"],
  webhook: Bun.env.WEBHOOK_DOMAIN
    ? {
        domain: Bun.env.WEBHOOK_DOMAIN,
        secret: Bun.env.WEBHOOK_SECRET || "",
      }
    : undefined,
};
