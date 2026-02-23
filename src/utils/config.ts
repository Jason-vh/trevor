export interface Config {
  squashCityCredentials: {
    username: string;
    password: string;
  };

  telegram: {
    token: string;
    chatId: string;
  };
}

if (!Bun.env.SQUASH_CITY_USERNAME || !Bun.env.SQUASH_CITY_PASSWORD) {
  throw new Error("Missing SquashCity credentials");
}

if (!Bun.env.TELEGRAM_BOT_TOKEN || !Bun.env.TELEGRAM_CHAT_ID) {
  throw new Error("Missing Telegram configuration");
}

export const config: Config = {
  squashCityCredentials: {
    username: Bun.env.SQUASH_CITY_USERNAME,
    password: Bun.env.SQUASH_CITY_PASSWORD,
  },
  telegram: {
    token: Bun.env.TELEGRAM_BOT_TOKEN,
    chatId: Bun.env.TELEGRAM_CHAT_ID,
  },
};
