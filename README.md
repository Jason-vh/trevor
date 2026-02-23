# Trevor - The Squash Bot

<div align="center">
  <img src="trevor.png" alt="Trevor the Squash Bot" width="200">
</div>

Trevor monitors squash court availability at [SquashCity](https://squashcity.baanreserveren.nl/), alerts you via Telegram when new slots appear, and can automatically book courts for you.

## What Trevor Does

- 🔍 **Monitors availability** - Checks schedules on a cron (configurable)
- 📱 **Smart notifications** - Only notifies when _new_ slots appear (no spam)
- 🤖 **Auto-booking** - Optionally books the earliest available court with `--book`
- 🧠 **State tracking** - Remembers what was available last time to detect changes
- 📊 **Structured logging** - JSON logs with timestamps for Railway

## Quick Start

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Configure credentials**

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your SquashCity credentials and Telegram bot token
   ```

3. **Run once**

   ```bash
   # Notify only
   bun start --from 17:00 --to 18:00 --day tue --day wed

   # Auto-book earliest available slot
   bun start --from 17:00 --to 18:00 --day tue --day wed --book
   ```

## Usage

```bash
bun start [options]
```

**Options:**

- `--from HH:MM` - Filter slots starting at or after this time
- `--to HH:MM` - Filter slots ending at or before this time
- `--day <day>` - Days to check (mon/tue/wed/thu/fri/sat/sun). Repeat for multiple: `--day tue --day wed`
- `--book` - Auto-book the earliest available slot in the time range

**Examples:**

```bash
# Tuesday/Wednesday evenings
bun start --from 17:00 --to 20:00 --day tue --day wed

# Weekend mornings
bun start --from 08:00 --to 12:00 --day sat --day sun
```

The bot checks the next 7 days and only sends Telegram notifications when availability _changes_ from the last run.

## Environment Variables

Create a `.env.local` file:

```bash
# Required: SquashCity login
SQUASH_CITY_USERNAME=your_username
SQUASH_CITY_PASSWORD=your_password

# Required: Telegram notifications (get from @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## How It Works

1. Logs into SquashCity with your credentials
2. Scrapes court availability for the next 7 days
3. Filters by your time/day preferences
4. Compares with previous state (`data/state.json`)
5. If `--book`: auto-books the earliest available court and sends confirmation
6. Sends Telegram alert if new slots appeared
7. Saves current state for next run

Uses lightweight scraping with `fetch` + Cheerio (no headless browser needed).

## Tech Stack

- **[Bun](https://bun.sh)** - Fast TypeScript runtime
- **[Grammy](https://grammy.dev)** - Telegram bot framework
- **[Cheerio](https://cheerio.js.org)** - Server-side HTML parsing

## Deployment

### Railway (recommended)

Deployed on [Railway](https://railway.com) with cron-based scheduling. Pushes to `main` auto-deploy via GitHub Actions.

## License

Personal project. Use responsibly and be considerate of server load.
