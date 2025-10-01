# Trevor - The Squash Bot

<div align="center">
  <img src="trevor.png" alt="Trevor the Squash Bot" width="200">
</div>

Trevor is an automated bot that monitors squash court availability at [SquashCity](https://squashcity.baanreserveren.nl/) and sends notifications via Telegram when slots become available.

## What Trevor Does

- 🔍 **Monitors availability** - Checks court schedules every 15 minutes
- 📱 **Telegram notifications** - Sends alerts when your preferred time slots open up
- 🎾 **Automated booking** - Can book courts automatically (with 48-hour safety check to avoid cancellation fees)

## Quick Start

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Configure credentials**
   ```bash
   cp .env.example .env.local
   # Add your SquashCity username/password and Telegram bot token
   ```

3. **Check availability**
   ```bash
   bun run check-availability.ts --start 17:00 --end 18:00 --days tue,wed
   ```

## Usage

### Check Availability
```bash
bun run check-availability.ts --start 17:00 --end 18:00 --days tue,wed
```

This will:
- Check the next 7 days for Tuesday/Wednesday slots between 17:00-18:00
- Output results to terminal
- Send a Telegram message with available courts

### Book a Slot
```bash
bun run examples/book-slot.ts
```

**Safety feature**: Only books slots 48+ hours in the future to avoid cancellation fees during testing.

### Run with PM2 (Recommended)
Use PM2 for automated monitoring with cron restart:
```bash
# Install PM2 globally
npm install -g pm2

# Start Trevor
pm2 start ecosystem.config.cjs

# Save PM2 config to restart on reboot
pm2 save
pm2 startup

# View logs
pm2 logs trevor

# Stop Trevor
pm2 stop trevor
```

The `ecosystem.config.cjs` is configured to check every 15 minutes for Tuesday/Wednesday slots between 17:25-18:30.

## Tech Stack

- **[Bun](https://bun.sh)** - Fast JavaScript runtime with native TypeScript
- **[Grammy](https://grammy.dev)** - Telegram bot framework
- **[Cheerio](https://cheerio.js.org)** - HTML parsing (no headless browser needed!)
- **SQLite** - Track slot history to detect new availability

## Environment Variables

Required in `.env.local`:
```bash
# SquashCity credentials
USERNAME=your_username
PASSWORD=your_password

# Telegram bot (create via @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## License

Personal project for automating squash court bookings. Use at your own risk.
