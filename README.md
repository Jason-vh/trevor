# Trevor - The Squash Bot

<div align="center">
  <img src="trevor.png" alt="Trevor the Squash Bot" width="200">
</div>

Trevor is a conversational AI chatbot for booking squash courts at [SquashCity](https://squashcity.baanreserveren.nl/). Send him a message like "book me a court next Tuesday at 18:30" and he'll check availability, confirm, and book. If nothing is available, he queues the request and retries every 5 minutes.

## What Trevor Does

- 💬 **Conversational booking** - Chat naturally in Dutch or English via Telegram
- 🔍 **Check availability** - Ask what courts are free for any date/time
- 🤖 **Auto-booking** - Confirms before booking, handles the full 3-step flow
- 📋 **Booking queue** - Watches for slots and books automatically when one opens up
- 📅 **View reservations** - Shows your upcoming bookings
- 🧠 **Conversation memory** - Remembers context across messages (persisted in Postgres)

## Quick Start

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Configure credentials**

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

3. **Set up database**

   ```bash
   # Create a local Postgres database
   createdb trevor

   # Run migrations
   bun run db:migrate
   ```

4. **Start the bot**

   ```bash
   bun start
   ```

   Trevor starts in long-polling mode locally (no public URL needed).

## Environment Variables

Create a `.env.local` file:

```bash
# Required: SquashCity login
SQUASH_CITY_USERNAME=your_username
SQUASH_CITY_PASSWORD=your_password

# Required: Telegram bot (get from @BotFather)
# Use separate bot tokens for dev vs prod
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id          # comma-separated for multiple chats

# Required: Claude API key
ANTHROPIC_API_KEY=sk-ant-your_key_here

# Required: Postgres connection
DATABASE_URL=postgresql://user:password@localhost:5432/trevor

# Production only (omit for local dev to use polling):
# WEBHOOK_DOMAIN=your-app.up.railway.app
# WEBHOOK_SECRET=random_secret_string
```

## How It Works

```
User message → Telegram → Grammy bot → pi-agent-core Agent → tool calls → response
```

1. User sends a message (DM or @mention in a group)
2. Conversation history is loaded from Postgres
3. A Claude-powered agent processes the message with access to 7 tools
4. Tools call existing scraping/booking modules to interact with SquashCity
5. The agent's response is sent back to Telegram
6. A Railway cron job processes the booking queue every 5 minutes (`bun run cron`)

### Agent Tools

| Tool | What it does |
|------|-------------|
| `get_today_date` | Resolves "next Tuesday" → 2025-03-04 |
| `check_availability` | Shows free courts for a date/time |
| `book_court` | Books a specific court (3-step flow) |
| `list_my_reservations` | Shows upcoming bookings |
| `add_to_queue` | Queues a request for auto-retry |
| `list_queue` | Shows pending queue entries |
| `remove_from_queue` | Cancels a queued request |

## Tech Stack

- **[Bun](https://bun.sh)** - TypeScript runtime
- **[Grammy](https://grammy.dev)** - Telegram bot framework
- **[pi-agent-core](https://github.com/nicholasgasior/pi-agent-core)** - Agent orchestration
- **[pi-ai](https://github.com/nicholasgasior/pi-ai)** - LLM communication (Anthropic/Claude)
- **[Drizzle ORM](https://orm.drizzle.team)** - Type-safe Postgres ORM
- **[Cheerio](https://cheerio.js.org)** - Server-side HTML parsing

## Deployment

### Railway (recommended)

Two Railway services from the same repo:

- **Web service** — long-running webhook server for Telegram. Start command: `bunx drizzle-kit migrate && bun run src/index.ts`. Restart policy: ON_FAILURE.
- **Cron service** — processes the booking queue. Start command: `bun run src/cron.ts`. Schedule: `*/5 * * * *`. Restart policy: NEVER.

Pushes to `main` auto-deploy via GitHub Actions. Set `WEBHOOK_DOMAIN` to your Railway public domain to enable webhook mode on the web service.

## License

Personal project. Use responsibly and be considerate of server load.
