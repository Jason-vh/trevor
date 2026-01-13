const REQUIRED_ENV_VARS = [
  "SQUASH_CITY_USERNAME",
  "SQUASH_CITY_PASSWORD",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
] as const;

for (const env of REQUIRED_ENV_VARS) {
  if (!Bun.env[env]) {
    throw new Error(`Missing required environment variable: ${env}`);
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseChatIds(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export interface Config {
  squashCityCredentials: {
    username: string;
    password: string;
  };

  telegram: {
    token: string;
    allowedChatIds: string[];
    webhookSecret: string;
  };

  openAI: {
    apiKey: string;
    model: string;
  };

  server: {
    port: number;
  };

  monitoring: {
    cronExpression: string;
    lookaheadDays: number;
    timezone?: string;
  };

  axiom: {
    token?: string;
    dataset?: string;
  };
}

const allowedChatIds = parseChatIds(Bun.env["TELEGRAM_CHAT_ID"]);

if (allowedChatIds.length === 0) {
  throw new Error("TELEGRAM_CHAT_ID must contain at least one chat id (comma separated)");
}

export const config: Config = {
  squashCityCredentials: {
    username: Bun.env["SQUASH_CITY_USERNAME"]!,
    password: Bun.env["SQUASH_CITY_PASSWORD"]!,
  },
  telegram: {
    token: Bun.env["TELEGRAM_BOT_TOKEN"]!,
    allowedChatIds,
    webhookSecret: Bun.env["TELEGRAM_WEBHOOK_SECRET"]!,
  },
  openAI: {
    apiKey: Bun.env["OPENAI_API_KEY"]!,
    model: Bun.env["OPENAI_MODEL"] || "gpt-4.1-mini",
  },
  server: {
    port: parseInteger(Bun.env["PORT"], 3000),
  },
  monitoring: {
    cronExpression: Bun.env["MONITOR_CRON"] || "*/15 * * * *",
    lookaheadDays: parseInteger(Bun.env["MONITOR_LOOKAHEAD_DAYS"], 7),
    timezone: Bun.env["MONITOR_TIMEZONE"] || Bun.env["TZ"],
  },
  axiom: {
    token: Bun.env["AXIOM_TOKEN"],
    dataset: Bun.env["AXIOM_DATASET"],
  },
};
