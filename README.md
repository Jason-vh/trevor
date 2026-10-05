# Trevor - The Squash Bot

<div align="center">
  <img src="trevor.png" alt="Trevor the Squash Bot" width="200">
</div>

Trevor books squash courts at [SquashCity](https://squashcity.baanreserveren.nl/) from a Telegram group chat. He reads along, and when someone @mentions him or replies to him ("@trevor book Tuesday 18:30"), he does it: checks what's free, books the best court, or queues the request and keeps retrying until a court opens up.

## What Trevor Does

- 💬 **Reads the group chat** for context, but only answers when he's @mentioned or replied to.
- 🔍 **Checks availability** for any date and time.
- 🤖 **Books courts** straight away, picking preferred courts when several are free at the same time. Courts starting within 6 hours need a clear yes first, since they can't be cancelled for free.
- 📋 **Queues requests** when nothing is free, and books the first matching court that opens up (checked every 5 minutes).
- 🔁 **Weekly bookings** ("every Tuesday at 18:30"): each week is queued once SquashCity opens the day, 7 days ahead, and booked from there. Skip the coming week by removing it from the queue.
- 📅 **Shows and cancels reservations**, and keeps a Google Calendar in sync.
- 🏆 **Keeps match scores**.
- ⏰ **Reminds the chat** in the morning when there's squash that day, in the chat that booked the court.

## How It Works

```
Telegram → grammY → pi-durable conversation (one per chat) → Claude + tools → send_message → Telegram
```

1. Every message in an allowed chat is stored in that chat's durable conversation, with who sent it and when.
2. Messages that @mention Trevor, reply to him, or come from a private chat wake him (Claude Sonnet 5.5). He reads them with the rest of the chat for context, uses his tools, and answers with `send_message`, the only way he can speak. Other messages only join his context.
3. Conversations, model turns and tool calls are committed to SQLite as they happen ([pi-durable](https://github.com/earendil-works/pi)), so a restart mid-turn picks up where it stopped.
4. Every 5 minutes, an in-process cron job tops up weekly bookings and works through the booking queue, and from 09:00 asks Trevor to remind each chat of the courts it booked for today. Queue bookings are written into the conversation as notices, so Trevor knows about them.

SquashCity has no API: Trevor logs in like a browser and scrapes the reservation pages.

### Tools

| Tool | What it does |
|------|-------------|
| `check_availability` | Free courts for a date and time range |
| `book_court` | Books a court (needs `confirmed` within 6 hours of the start) |
| `list_my_reservations` | Upcoming bookings |
| `cancel_reservation` | Cancels a booking |
| `add_to_queue` / `list_queue` / `remove_from_queue` | The booking queue |
| `add_recurring_booking` / `list_recurring_bookings` / `stop_recurring_booking` | Weekly bookings |
| `record_score` / `list_scores` | Match scores |
| `set_court_preference` / `list_court_preferences` | Preferred and avoided courts |
| `send_message` | Says something in the chat |

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

3. **Start the bot**

   ```bash
   bun start
   ```

   Trevor starts in long-polling mode locally (no public URL needed), and keeps his data in `./data`. Use a separate Telegram bot for development, with privacy mode off (BotFather → `/setprivacy` → Disable) so it receives group messages.

## Environment Variables

| Variable | |
|---|---|
| `SQUASH_CITY_USERNAME`, `SQUASH_CITY_PASSWORD` | SquashCity login |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Chats Trevor may talk in, comma-separated |
| `ANTHROPIC_API_KEY` | Claude |
| `DATA_DIR` | Where the SQLite files go (default `data`) |
| `CALENDAR_WEBHOOK_URL` | Google Apps Script calendar sync (optional) |
| `WEBHOOK_DOMAIN`, `WEBHOOK_SECRET` | Webhook mode, production only |

## Development

```bash
bun run dev          # restart on changes
bun test
bun run lint
bun run fmt
bun run db:generate  # after changing src/db/schema.ts
```

Migrations run when Trevor starts.

## Tech Stack

- **[Bun](https://bun.sh)** — runtime, HTTP server and SQLite
- **[grammY](https://grammy.dev)** — Telegram
- **[pi-durable](https://github.com/earendil-works/pi)** and **pi-ai** — durable agent conversations and Claude
- **[Drizzle ORM](https://orm.drizzle.team)** — queue, scores and preferences in SQLite
- **[Cheerio](https://cheerio.js.org)** — parsing SquashCity's pages
- **[croner](https://github.com/Hexagon/croner)** — the queue schedule

## Deployment

Trevor runs on an exe.dev VM at https://trevor.vhtm.eu, deployed by GitHub Actions on every push to `main`. See [deploy/README.md](deploy/README.md).

## License

Personal project. Use responsibly and be considerate of server load.
