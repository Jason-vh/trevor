declare module "bun" {
  interface Env {
    SQUASH_CITY_USERNAME?: string;
    SQUASH_CITY_PASSWORD?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    ANTHROPIC_API_KEY?: string;
    DATABASE_URL?: string;
    WEBHOOK_DOMAIN?: string;
    WEBHOOK_SECRET?: string;
    PORT?: string;
  }
}
