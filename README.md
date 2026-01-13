# Trevor - The Squash Agent

<div align="center">
  <img src="trevor.png" alt="Trevor the Squash Bot" width="200">
</div>

Trevor is now a Bun-based web server that lives behind a Telegram webhook and answers in natural language. He can:

- 🔎 **Check availability on demand** – ask “Can we play next Wednesday evening?” and Trevor will scrape SquashCity for you.
- ⏰ **Schedule monitors** – say “Ping us for Tuesday between 18:00-20:00” and Trevor stores a monitor that runs via cron.
- 🤖 **Use AI to understand requests** – powered by [AI SDK](https://ai-sdk.dev/) + OpenAI.
- 📟 **Log everything to Axiom** – existing logging pipeline still works in production.

All state (monitors + last notifications) now lives in `data/monitors.json`. The old CLI + `data/state.json` flow is gone.

---

## Getting Started

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   # edit .env.local with SquashCity creds, Telegram bot, OpenAI key, etc.
   ```

   Required variables:

   | Name | Description |
   | --- | --- |
   | `SQUASH_CITY_USERNAME` / `SQUASH_CITY_PASSWORD` | Login used for scraping |
   | `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
   | `TELEGRAM_CHAT_ID` | Comma separated allowlist of chat/group ids Trevor may answer |
   | `TELEGRAM_WEBHOOK_SECRET` | Random slug used in the webhook URL (`/telegram/<secret>`) |
   | `OPENAI_API_KEY` | Key for GPT models via AI SDK |

   Optional:

   | Name | Default | Purpose |
   | --- | --- | --- |
   | `OPENAI_MODEL` | `gpt-4.1-mini` | Change assistant model |
   | `PORT` | `3000` | Bun server port |
   | `MONITOR_CRON` | `*/15 * * * *` | Cron expression for scheduled checks |
   | `MONITOR_LOOKAHEAD_DAYS` | `7` | How far Trevor looks ahead for weekday monitors |
   | `MONITOR_TIMEZONE` / `TZ` | system tz | Cron timezone |
   | `AXIOM_TOKEN` / `AXIOM_DATASET` | – | Enable centralized logging |

3. **Run the server**

   ```bash
   bun dev # or bun start
   ```

4. **Wire up Telegram**

   Set the webhook to point at your public URL plus the secret path:

   ```bash
   curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -d "url=https://your-domain.com/telegram/${TELEGRAM_WEBHOOK_SECRET}"
   ```

   Trevor also exposes `GET /healthz` for liveness checks.

---

## Talking to Trevor

Examples of things Trevor understands:

- “Are there any courts free tomorrow between 17:00 and 19:00?”
- “Monitor next Tuesday evening and let me know if something opens up.”
- “List the current monitors.”

Behind the scenes the AI agent decides whether it should:

1. Call `checkAvailability` (scrapes immediately and formats a report).
2. Call `createMonitor` (stores parameters in `data/monitors.json`).
3. Call `listMonitors` (summarises what’s being watched).

Every reply goes right back into the Telegram chat that triggered it (only chats listed in `TELEGRAM_CHAT_ID` are served).

---

## Monitors & Scheduler

- Monitors live in `data/monitors.json` with structure `{ id, chatId, fromTime, toTime, daysOfWeek?, dates?, lastNotified }`.
- The cron job (configured via `MONITOR_CRON`) logs into SquashCity, fetches the relevant days, and only sends a Telegram message when **new** slots appear compared to `lastNotified`.
- After a monitor finishes all explicit dates it is automatically deactivated (weekday-based monitors keep running).

To inspect/change monitors manually you can edit `data/monitors.json` while Trevor is offline, but prefer using the chat agent so the AI keeps descriptions consistent.

---

## Architecture

- **Runtime**: [Bun](https://bun.sh) server created via `Bun.serve`.
- **Routing**: `POST /telegram/<secret>` webhook + `GET /healthz`.
- **AI layer**: [AI SDK](https://ai-sdk.dev/) + `@ai-sdk/openai`, using tool calls to bridge to TypeScript functions.
- **Scheduling**: [`croner`](https://github.com/Hexagon/croner) drives periodic checks.
- **Scraping**: Existing Cheerio-based modules (`auth`, `scraper`, `parser`, `slots`) reused as-is.
- **Logging**: `@axiomhq/logging` transports to console + Axiom when `NODE_ENV=production`.

---

## Development Tips

- The Telegram webhook expects a public URL. During local dev you can tunnel (e.g. `ngrok http 3000`) and point the webhook there.
- If you edit `data/monitors.json` manually, restart the Bun process to ensure the scheduler reloads the file.
- To reset Trevor, delete `data/monitors.json` (or replace with `[]`) and restart.

---

## License

Personal project. Scrape responsibly and keep load on SquashCity reasonable.
