# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Trevor - Squash Court Monitor

Automated notification system that monitors court availability at SquashCity (https://squashcity.baanreserveren.nl/) and sends Telegram alerts when **new** slots appear. Uses state tracking to avoid spam.

## Essential Commands

```bash
# Run once
bun start --start 17:00 --end 18:00 --day tue --day wed

# Development with auto-reload
bun run dev

# Run tests
bun test

# Run with PM2 (cron-based)
pm2 start ecosystem.config.cjs
pm2 logs trevor
```

## Architecture Overview

### Core Flow
```
1. Auth     → Login, extract session cookies
2. Scraper  → Inject cookies, fetch HTML pages
3. Parser   → Cheerio extracts availability from HTML
4. State    → Compare with previous state, find changes
5. Notify   → Send Telegram message for new slots only
```

### Why This Approach?
The target website uses **server-side rendered HTML** (not a SPA), so:
- ✅ Native `fetch` + Cheerio (lightweight)
- ❌ No Puppeteer/Playwright needed (would be overkill)

### Key Design Decisions

**Session Management**: Cookie-based auth stored in-memory. The `Session` interface (src/types/index.ts:1) holds a `cookies[]` array extracted from login response headers using Bun's `response.headers.getSetCookie()`.

**State Tracking**: JSON file (`data/state.json`) persists all slot states between runs. The `findChangedSlots()` function (src/modules/state.ts:22) compares old vs new states by courtId, time, date, and availability to detect changes. Only changed slots trigger notifications.

**Configuration**: All config in src/utils/config.ts loads from environment variables (`.env.local`). Required: `SQUASH_CITY_USERNAME`, `SQUASH_CITY_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Optional: `AXIOM_TOKEN`, `AXIOM_DATASET`.

**Logging**: Axiom-based structured logger (src/utils/logger.ts) with dual transports:
- Console (always, pretty-printed)
- Axiom remote logging (optional, only when `NODE_ENV=production` AND token/dataset configured)

**Path Aliases**: TypeScript paths use `@/*` → `./src/*` (tsconfig.json:10)

## Module Responsibilities

### src/modules/auth.ts
Handles login flow:
- POSTs form data to `/auth/login`
- Extracts `Set-Cookie` headers via `response.headers.getSetCookie()`
- Returns `Session` object with cookies array
- Expects 302 redirect on success

### src/modules/scraper.ts
HTTP wrapper that injects session cookies:
- Strips cookie metadata (takes only name=value before `;`)
- Joins cookies with `; ` separator
- Sets User-Agent to avoid bot detection

### src/modules/parser.ts
Cheerio-based HTML parser:
- Extracts court names from `<thead> th.header-name` (text) and court IDs from class `r-(\d+)`
- Parses time slots from `<tr data-time="HH:MM">`
- Identifies availability via `td.slot.free` vs `td.slot.taken`
- Detects off-peak pricing via `.off-peak` class
- Returns array of `CourtAvailability` objects

### src/modules/slots.ts
Business logic for filtering/grouping:
- `getAllSlotsOnDate()` - Fetches and parses slots for a specific date
- `filterByTimeRange()` - Filters slots by start/end time (converted to minutes)
- `filterAndGroupSlots()` - Filters by time, availability, then groups by date → time → courts

### src/modules/state.ts
Persistence layer:
- `saveState()` - Writes all slots to `data/state.json`
- `loadState()` - Reads previous state from JSON
- `findChangedSlots()` - Compares slots by courtId + time + date + availability, returns delta

### src/modules/notify.ts
Telegram integration via Grammy:
- `buildMessage()` - Formats slots as Markdown (groups by date, then time)
- `notify()` - Sends message to configured chat ID

### src/index.ts (Entry Point)
Main orchestration:
1. Parse CLI args (`--start`, `--end`, `--day` flags)
2. Filter next 7 days by requested weekdays
3. Login and fetch slots for each day in parallel
4. Compare with previous state
5. Exit early if no changes
6. Build and send Telegram notification
7. Save new state

## Critical Implementation Details

### Cookie Handling Pattern
```typescript
// Login extracts cookies from Set-Cookie headers
const response = await fetch(loginUrl, { method: 'POST', ... });
const cookies = response.headers.getSetCookie(); // Bun built-in
// Returns: ["session_id=abc; Path=/; HttpOnly", "XSRF-TOKEN=xyz; ..."]

// Scraper strips metadata and joins
const cookieHeader = session.cookies
  .map(cookie => cookie.split(';')[0])
  .join('; ');
// Result: "session_id=abc; XSRF-TOKEN=xyz"

fetch(url, { headers: { Cookie: cookieHeader } });
```

### HTML Parsing Pattern
```typescript
import * as cheerio from 'cheerio';

const $ = cheerio.load(htmlString);

// Extract court mapping from header
const courts = new Map<number, string>();
$('thead th.header-name').each((_, el) => {
  const name = $(el).text().trim();
  const id = $(el).attr('class')?.match(/r-(\d+)/)?.[1];
  courts.set(parseInt(id), name);
});

// Parse time rows
$('tr[data-time]').each((_, row) => {
  const time = $(row).attr('data-time');
  $(row).find('td.slot').each((_, cell) => {
    const isAvailable = $(cell).attr('class')?.includes('free');
    // ...
  });
});
```

### State Change Detection
```typescript
// Only notify if slot didn't exist before OR availability changed
const changedSlots = newSlots.filter(newSlot => {
  const oldSlot = oldSlots.find(old =>
    old.courtId === newSlot.courtId &&
    old.formattedStartTime === newSlot.formattedStartTime &&
    old.formattedDate === newSlot.formattedDate &&
    old.isAvailable === newSlot.isAvailable
  );
  return oldSlot === undefined; // true = changed
});
```

## Environment Variables

Create `.env.local` (gitignored):
```bash
SQUASH_CITY_USERNAME=your_username
SQUASH_CITY_PASSWORD=your_password
TELEGRAM_BOT_TOKEN=bot_token_from_botfather
TELEGRAM_CHAT_ID=your_chat_id
AXIOM_TOKEN=axiom_token          # Optional
AXIOM_DATASET=dataset_name        # Optional
```

## PM2 Deployment

The `ecosystem.config.cjs` runs Trevor every 15 minutes via cron:
- Entry: `src/index.ts`
- Cron: `*/15 * * * *`
- Args: `--start 17:25 --end 18:30 --day tue --day wed --day thu`
- Timezone: `Europe/Amsterdam`
- Auto-restart: `false` (exit after each run)

Edit the file to customize schedule/preferences.

## Website Specifics

**Target**: https://squashcity.baanreserveren.nl/

**Known endpoints**:
- `/auth/login` - POST with `username` and `password` form fields
- `/reservations/{YYYY-MM-DD}/sport/{sportId}` - GET schedule (sportId 15 = squash)

**Authentication**: Cookie-based sessions. Login returns 302 redirect with Set-Cookie headers.

**HTML structure**:
- Matrix layout with 13 courts (Baan 1-13)
- Court names in `<thead> th.header-name>` text
- Court IDs in class `r-(\d+)` (e.g., `r-56` = court 56)
- Time rows: `<tr data-time="HH:MM">`
- Availability cells: `td.slot.free` (available) vs `td.slot.taken` (booked)
- Off-peak pricing: `.off-peak` class
- Date in `#matrix_date_title` element
