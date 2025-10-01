// Configuration management

import type { Config } from "../types";
import { ErrorCode, ScraperError } from "../utils/errors";

export function loadConfig(): Config {
  const requiredVars = ["USERNAME", "PASSWORD"];
  const missing = requiredVars.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    throw new ScraperError(
      `Missing required environment variables: ${missing.join(", ")}`,
      ErrorCode.CONFIG_ERROR
    );
  }

  const config: Config = {
    targetUrl: process.env.TARGET_URL || "https://squashcity.baanreserveren.nl",
    loginUrl:
      process.env.LOGIN_URL ||
      "https://squashcity.baanreserveren.nl/auth/login",
    reservationsUrl:
      process.env.RESERVATIONS_URL ||
      "https://squashcity.baanreserveren.nl/reservations",
    credentials: {
      username: process.env.USERNAME!,
      password: process.env.PASSWORD!,
    },
    options: {
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || "3600", 10),
      maxRetries: parseInt(process.env.MAX_RETRIES || "3", 10),
      retryDelay: parseInt(process.env.RETRY_DELAY || "1000", 10),
    },
  };

  // Optional Telegram configuration
  if (process.env.TELEGRAM_BOT_TOKEN) {
    config.telegram = {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    };
  }

  return config;
}
