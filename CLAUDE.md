# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Trevor - Squash Court Booking Bot

Automated system to monitor court availability at SquashCity (https://squashcity.baanreserveren.nl/), send Telegram notifications, and automate bookings.

## Essential Commands

```bash
# Check availability (main script)
bun run check-availability.ts --start 17:00 --end 18:00 --days tue,wed

# Book a slot
bun run examples/book-slot.ts

# Development
bun run dev        # Auto-reload on file changes
bun run start      # Run without auto-reload
bun test          # Run tests
```

## Architecture Overview

### Why This Approach?
The target website uses **server-side rendered HTML with traditional forms** (POST /login, GET /reservations), not a JavaScript SPA. Therefore:
- ✅ Use native fetch + Cheerio (lightweight HTML parsing)
- ❌ No Puppeteer/Playwright needed (would be 100x heavier)

### Module Flow
```
Auth → Login + extract cookies from Set-Cookie headers
  ↓
Scraper → Inject cookies into requests, fetch HTML pages
  ↓
Parser → Cheerio extracts availability data from HTML
  ↓
Notification → Grammy sends formatted messages via Telegram
```

### Key Design Decisions

**Session Management**: Cookie-based sessions stored in-memory. The `Session` interface in [src/types/index.ts](src/types/index.ts) holds `cookies[]` array extracted from login response headers.

**Error Handling**: Custom `ScraperError` class with `ErrorCode` enum distinguishes retryable errors (NETWORK_ERROR, SESSION_EXPIRED) from non-retryable (AUTH_FAILED, CONFIG_ERROR). See [src/utils/errors.ts](src/utils/errors.ts).

**Configuration**: [src/config/index.ts](src/config/index.ts) loads from environment variables. Uses `.env.local` (Bun auto-loads this) for credentials. Required: `USERNAME`, `PASSWORD`. Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

**Logging**: Structured logger in [src/utils/logger.ts](src/utils/logger.ts) with format: `logger.info('moduleName', 'message', metadata)`.

**Retry Logic**: [src/utils/retry.ts](src/utils/retry.ts) implements exponential backoff with configurable max retries.

**Dependencies**:
- `cheerio` - HTML parsing (jQuery-like syntax for server-side)
- `grammy` - Telegram bot framework (used in check-availability.ts)

## Module Responsibilities

### src/modules/auth/
✅ **Implemented** - Handles login POST request, extracts Set-Cookie headers from response, stores in Session object.

### src/modules/scraper/
✅ **Implemented** - HTTP client wrapper that injects session cookies into requests.

### src/modules/parser/
✅ **Implemented** - Cheerio-based HTML parsing to extract structured availability data. Extracts courtId, timestamp, date, and booking URLs for each free slot.

### src/modules/booking/
✅ **Implemented** - Automated booking with critical safety features:
- **48-hour safety check**: Prevents booking slots less than 48 hours away (to avoid cancellation fees during testing)
- Fetches booking form to extract CSRF token
- Submits booking to `/reservations/confirm` endpoint
- Returns BookingResult with success status and message

**Usage**:
```typescript
import { bookSlot, isSafeForTesting } from './src/modules/booking';

// Check if slot is safe (48+ hours away)
if (isSafeForTesting(slot)) {
  const result = await bookSlot(baseUrl, slot, session);
  console.log(result.success ? 'Booked!' : 'Failed');
}
```

### Telegram Notifications
✅ **Implemented** - Grammy-based Telegram bot integration in `check-availability.ts`:
- Formats availability results as Markdown messages
- Sends to configured chat ID
- Supports group chats (negative chat IDs)
- Only sends if `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured

### check-availability.ts (Main Script)
✅ **Implemented** - Command-line tool for monitoring court availability:
- Accepts CLI args: `--start HH:MM --end HH:MM --days mon,tue,wed,...`
- Checks next 7 days (booking system limit)
- Filters slots by time range and days of week
- Groups multiple courts at same time slot
- Shows 48-hour safety indicator (⚠️ vs ✅)
- Outputs to terminal and sends Telegram message
- Designed for cron job usage (every 15 minutes)

**Usage**:
```bash
bun run check-availability.ts --start 17:00 --end 18:00 --days tue,wed
```

**PM2 deployment** (recommended):
```bash
pm2 start ecosystem.config.js
pm2 logs trevor
```

The `ecosystem.config.js` is configured to:
- Run every 15 minutes via cron restart (`*/15 * * * *`)
- Check Tuesday/Wednesday slots from 17:25-18:30
- Use Bun as the interpreter
- Exit after each run (autorestart: false)

## Critical Implementation Details

### Cookie Handling Pattern
```typescript
// Login response has Set-Cookie headers
const response = await fetch(loginUrl, { method: 'POST', ... });
const cookies = response.headers.getSetCookie(); // Bun's built-in method
// Store in Session: { cookies, expiresAt }

// Subsequent requests
const cookieHeader = session.cookies.join('; ');
fetch(url, { headers: { Cookie: cookieHeader } });
```

### HTML Parsing Pattern
```typescript
import * as cheerio from 'cheerio';

const $ = cheerio.load(htmlString);
// Use jQuery-like selectors
const slots = $('.availability-slot').map((i, el) => {
  return {
    court: $(el).find('.court-name').text(),
    // ...
  };
}).get();
```

### Error Propagation
Throw `ScraperError` with appropriate `ErrorCode` and `retryable` flag. Let `withRetry()` util handle retries for retryable errors.

## Current Implementation Status

✅ Project structure, config, error handling, logging, retry utils
✅ Auth module (login + session extraction)
✅ Scraper module (HTTP client with cookie injection)
✅ Parser module (extract 13 courts, 145+ slots from HTML)
✅ **Booking module with 48-hour safety check**
✅ **Telegram notifications via Grammy**
✅ **Availability checker script** (`check-availability.ts`)
✅ **Automatic player ID extraction from booking forms**

Ready for cron scheduling!

## Documentation References

- [requirements.md](requirements.md) - Detailed functional/non-functional requirements
- [architecture.md](architecture.md) - Complete architecture with diagrams and data flows
- [README.md](README.md) - Quick start guide and environment setup

## Testing Approach

When implementing modules:
1. Save HTML fixtures from live site (e.g., tests/fixtures/reservations.html)
2. Unit test parser with fixtures
3. Integration test auth flow with mock responses
4. Manual test against live site last

## Security Notes

- Never log credentials (config loader enforces this)
- Use `.env.local` for credentials (in .gitignore)
- All requests must use HTTPS
- Sanitize errors before logging (no sensitive data)
- Respect rate limits when scraping

## Website Specifics

**Target**: https://squashcity.baanreserveren.nl/

**Known endpoints**:
- `/auth/login` - POST with form data (username/password fields)
- `/reservations/{date}/sport/{sportId}` - GET schedule for specific date (e.g., `/reservations/2025-10-03/sport/15`)
- `/reservations/make/{courtId}/{timestamp}` - GET booking form with CSRF token
- `/reservations/confirm` - POST booking confirmation with form data

**Authentication**: Traditional cookie-based sessions. No CAPTCHA or aggressive bot detection observed.

**HTML structure**:
- Matrix layout with 13 courts (Baan 1-13)
- Time slots in `<tr utc="timestamp" data-time="HH:MM">` rows
- Free slots: `<td class="slot free" slot="courtId">`
- Taken slots: `<td class="slot taken">`
- Sport ID for squash: 15