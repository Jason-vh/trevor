declare module "bun" {
  interface Env {
    SQUASH_CITY_USERNAME: string;
    SQUASH_CITY_PASSWORD: string;
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string;
    AXIOM_TOKEN: string;
    AXIOM_DATASET: string;
  }
}
