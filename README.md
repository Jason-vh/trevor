# Trevor - The Squash Bot

<div align="center">
  <img src="trevor.png" alt="Trevor the Squash Bot" width="200">
</div>

Trevor monitors squash court availability at [SquashCity](https://squashcity.baanreserveren.nl/) and alerts you via Telegram when new slots appear.

## What Trevor Does

- 🔍 **Monitors availability** - Checks schedules every 15 minutes (configurable)
- 📱 **Smart notifications** - Only notifies when _new_ slots appear (no spam)
- 🧠 **State tracking** - Remembers what was available last time to detect changes
- 📊 **Optional logging** - Ships logs to Axiom for debugging

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
   bun start --from 17:00 --to 18:00 --day tue --day wed
   ```

4. **Run continuously with PM2** _(recommended)_
   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.cjs
   pm2 save && pm2 startup
   ```

## Usage

```bash
bun start [options]
```

**Options:**

- `--from HH:MM` - Filter slots starting at or after this time
- `--to HH:MM` - Filter slots ending at or before this time
- `--day <day>` - Days to check (mon/tue/wed/thu/fri/sat/sun). Repeat for multiple: `--day tue --day wed`

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

# Optional: Axiom logging
AXIOM_TOKEN=your_token
AXIOM_DATASET=your_dataset
```

## How It Works

1. Logs into SquashCity with your credentials
2. Scrapes court availability for the next 7 days
3. Filters by your time/day preferences
4. Compares with previous state (`data/state.json`)
5. Sends Telegram alert if new slots appeared
6. Saves current state for next run

Uses lightweight scraping with `fetch` + Cheerio (no headless browser needed).

## Tech Stack

- **[Bun](https://bun.sh)** - Fast TypeScript runtime
- **[Grammy](https://grammy.dev)** - Telegram bot framework
- **[Cheerio](https://cheerio.js.org)** - Server-side HTML parsing
- **[Axiom](https://axiom.co)** - Optional logging

## PM2 Configuration

The included `ecosystem.config.cjs` runs Trevor every 15 minutes via cron:

```javascript
{
  cron_restart: '*/15 * * * *',  // Every 15 minutes
  args: '--from 17:25 --to 18:30 --day tue --day wed --day thu',
  env: { TZ: 'Europe/Amsterdam' }
}
```

Edit the file to customize your schedule and preferences.

## License

Personal project. Use responsibly and be considerate of server load.
