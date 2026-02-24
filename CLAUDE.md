# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Trevor - Squash Court Chatbot

Conversational AI chatbot that monitors squash court availability at SquashCity (https://squashcity.baanreserveren.nl/), books courts on demand via Telegram, and queues requests for automatic retry. Powered by pi-agent-core with Claude as the LLM.

## Essential Commands

```bash
# Start bot (long-polling mode for local dev)
bun start

# Development with auto-reload
bun run dev

# Generate Drizzle migration after schema changes
bun run db:generate

# Apply migrations
bun run db:migrate

# Run tests
bun test
```

## Architecture Overview

### Core Flow

```
User message → Telegram (webhook in prod / polling in dev)
  → Grammy bot.on("message:text")
  → pi-agent-core Agent with tools
  → tool execution (reusing existing scraping/booking modules)
  → response back to Telegram
```

Background `setInterval` scheduler processes the booking queue every 5 minutes.

### Transport Modes

- **Production** (Railway): Webhooks via `Bun.serve` HTTP server. Detected by presence of `WEBHOOK_DOMAIN` env var.
- **Development** (local): Grammy long polling via `bot.start()`. No public URL needed. Detected by absence of `WEBHOOK_DOMAIN`.

### Why This Approach?

The target website uses **server-side rendered HTML** (not a SPA), so:

- ✅ Native `fetch` + Cheerio (lightweight)
- ❌ No Puppeteer/Playwright needed (would be overkill)

### Key Design Decisions

**Session Management**: Cookie-based auth stored in-memory with 30min TTL cache (src/modules/session-manager.ts). The `Session` interface (src/types/index.ts:1) holds a `cookies[]` array extracted from login response headers using Bun's `response.headers.getSetCookie()`.

**Agent Architecture**: Each incoming message creates a fresh pi-agent-core `Agent` instance with conversation history loaded from Postgres. The agent has 7 tools for checking availability, booking courts, managing the queue, etc. Conversation history is stored as user/assistant text messages in the `messages` table.

**Database**: Postgres via Drizzle ORM. Two tables: `queue` (booking requests for background retry) and `messages` (conversation history per chat). Migrations in `drizzle/`.

**Chat Authorization**: Supports multiple Telegram chat IDs (comma-separated in `TELEGRAM_CHAT_ID`). In groups, only responds when `@mentioned`. In DMs, responds to all messages.

**Configuration**: All config in src/utils/config.ts loads from environment variables (`.env.local`). Required: `SQUASH_CITY_USERNAME`, `SQUASH_CITY_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY`, `DATABASE_URL`.

**Logging**: Minimal JSON structured logger (src/utils/logger.ts). Outputs single-line JSON with `level`, `message`, `timestamp`, and optional custom fields. Integrates with Railway's log filtering/querying.

**Path Aliases**: TypeScript paths use `@/*` → `./src/*` (tsconfig.json:10)

## Module Responsibilities

### src/agent/agent.ts

Agent orchestration:

- Creates a pi-agent-core `Agent` per request with system prompt, tools, and conversation history
- Loads history from Postgres, runs the agentic loop, extracts the final text response
- Saves user message and assistant response to DB after each interaction

### src/agent/tools.ts

7 tools using TypeBox schemas + execute functions that call existing modules:

| Tool | Purpose |
|------|---------|
| `get_today_date` | Resolve relative dates ("next Tuesday") → YYYY-MM-DD |
| `check_availability` | Show free courts for a date/time range |
| `book_court` | Execute the 3-step booking flow |
| `list_my_reservations` | Show user's upcoming bookings (next 8 days) |
| `add_to_queue` | Queue a request for periodic retry |
| `list_queue` | Show pending queue entries |
| `remove_from_queue` | Cancel a queue entry |

### src/agent/system-prompt.ts

Trevor's personality and instructions. Casual squash buddy, responds in user's language, confirms before booking, uses Telegram HTML formatting.

### src/db/schema.ts

Drizzle table definitions:

- `queue` — booking requests with status lifecycle (pending → processing → booked/expired/cancelled)
- `messages` — conversation history per chat_id (role + jsonb content)

### src/db/index.ts

Drizzle client setup with postgres-js driver.

### src/modules/auth.ts

Handles login flow:

- POSTs form data to `/auth/login`
- Extracts `Set-Cookie` headers via `response.headers.getSetCookie()`
- Returns `Session` object with cookies array
- Expects 302 redirect on success

### src/modules/session-manager.ts

Wraps `login()` with 30min TTL cache:

- `getSession()` — returns cached session or logs in fresh
- `invalidateSession()` — forces re-login on next call

### src/modules/scraper.ts

HTTP wrapper that injects session cookies:

- `getPage()` - GET requests with session cookies
- `postPage()` - POST requests with session cookies, CSRF referer/origin headers
- Strips cookie metadata (takes only name=value before `;`)
- Sets User-Agent to avoid bot detection

### src/modules/parser.ts

Cheerio-based HTML parser:

- Extracts court names from `<thead> th.header-name` (text) and court IDs from class `r-(\d+)`
- Parses time slots from `<tr data-time="HH:MM">` and UTC timestamps from `utc` attribute
- Identifies availability via `td.slot.free` vs `td.slot.taken`
- Detects off-peak pricing via `.off-peak` class
- Accepts `dateISO` parameter to attach date context to each slot
- Returns array of `CourtAvailability` objects

### src/modules/slots.ts

Business logic for filtering/grouping:

- `getAllSlotsOnDate()` - Fetches and parses slots for a specific date
- `filterByTimeRange()` - Filters slots by start/end time (converted to minutes)
- `filterAndGroupSlots()` - Filters by time, availability, then groups by date → time → courts

### src/modules/state.ts

Legacy persistence layer (from cron mode, still available):

- `saveState()` / `loadState()` - Persists all slots to `data/state.json`
- `findChangedSlots()` - Compares slots by courtId + time + date + availability, returns delta

### src/modules/booking.ts

Auto-booking engine (3-step form flow):

1. GET booking form → extract hidden fields + CSRF token
2. POST to `/reservations/confirm` → get confirmation page
3. POST with `confirmed=1` → finalize booking
- `getCandidateSlots()` - Filters available slots not already booked, sorted by earliest
- `bookSlot()` - Executes the 3-step booking flow
- Uses a hardcoded booking partner ID for the second player

### src/modules/notify.ts

Telegram message formatting:

- `buildMessage()` - Formats changed slots as Markdown (groups by date, then time)
- `buildBookingMessage()` - Formats booking confirmations/failures (used by scheduler)

### src/modules/queue.ts

Queue CRUD operations against Postgres via Drizzle:

- `addToQueue()` / `listPendingQueue()` / `removeFromQueue()`
- `getProcessableEntries()` / `setQueueStatus()` / `expirePastEntries()`

### src/modules/history.ts

Conversation history CRUD against Postgres via Drizzle:

- `saveMessage()` — stores user/assistant messages with chat_id
- `loadHistory()` — loads last 20 messages, reconstructs pi-ai Message objects

### src/modules/scheduler.ts

Background scheduler with `isProcessing` guard:

- Runs every 5 minutes via `setInterval`
- Expires past-date queue entries
- For each pending entry: login, fetch slots, filter, attempt booking
- On success: updates queue status to "booked", sends Telegram notification to all chats

### src/index.ts (Entry Point)

Bot setup and lifecycle:

1. Create Grammy Bot instance
2. Auth middleware: ignore messages from chats not in `config.telegram.chatIds`
3. Group filtering: only respond to `@mentions` in groups, strip mention from message text
4. Register `bot.on("message:text")` → calls `runAgent()` → replies with HTML formatting
5. If `WEBHOOK_DOMAIN` set: start `Bun.serve` with webhook endpoint + health check
6. If no `WEBHOOK_DOMAIN`: start Grammy long polling
7. Start scheduler
8. SIGTERM/SIGINT handler: stop scheduler, stop server/polling, exit

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
import * as cheerio from "cheerio";

const $ = cheerio.load(htmlString);

// Extract court mapping from header
const courts = new Map<number, string>();
$("thead th.header-name").each((_, el) => {
  const name = $(el).text().trim();
  const id = $(el)
    .attr("class")
    ?.match(/r-(\d+)/)?.[1];
  courts.set(parseInt(id), name);
});

// Parse time rows
$("tr[data-time]").each((_, row) => {
  const time = $(row).attr("data-time");
  $(row)
    .find("td.slot")
    .each((_, cell) => {
      const isAvailable = $(cell).attr("class")?.includes("free");
      // ...
    });
});
```

### Tool Definition Pattern (pi-agent-core)

```typescript
const schema = Type.Object({
  date: Type.String({ description: "Date in YYYY-MM-DD format" }),
  time_from: Type.Optional(Type.String({ description: "Start time HH:MM" })),
});

const tool: AgentTool<typeof schema> = {
  name: "check_availability",
  label: "Check Availability",
  description: "Check available squash courts for a specific date and time range",
  parameters: schema,
  execute: async (toolCallId, params) => {
    // params is typed: { date: string; time_from?: string }
    return { content: [{ type: "text", text: JSON.stringify(result) }], details: undefined };
  },
};
```

## Environment Variables

Create `.env.local` (gitignored):

```bash
SQUASH_CITY_USERNAME=your_username
SQUASH_CITY_PASSWORD=your_password
TELEGRAM_BOT_TOKEN=bot_token_from_botfather
TELEGRAM_CHAT_ID=your_chat_id              # comma-separated for multiple chats
ANTHROPIC_API_KEY=sk-ant-your_key_here
DATABASE_URL=postgresql://user:password@localhost:5432/trevor

# Production only (omit for local dev):
# WEBHOOK_DOMAIN=your-app.up.railway.app
# WEBHOOK_SECRET=random_secret_string
```

## Deployment

### Railway (primary)

Deployed on Railway as a long-running service. Config in `railway.json`:

- Builder: Nixpacks
- Start command: `bunx drizzle-kit migrate && bun run src/index.ts`
- Region: `europe-west4`
- Restart policy: ON_FAILURE

Required Railway env vars: all from `.env.local` above, plus `WEBHOOK_DOMAIN` (use `RAILWAY_PUBLIC_DOMAIN`) and `WEBHOOK_SECRET`.

**CI/CD**: Pushes to `main` auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`). Uses `RAILWAY_TOKEN` secret for authentication.

```bash
# Manual deploy
railway up --service trevor

# Check logs
railway logs --service trevor
```

## Website Specifics

**Target**: https://squashcity.baanreserveren.nl/

**Known endpoints**:

- `/auth/login` - POST with `username` and `password` form fields
- `/reservations/{YYYY-MM-DD}/sport/{sportId}` - GET schedule (sportId 15 = squash)
- `/reservations/make/{courtId}/{utc}` - GET booking form
- `/reservations/confirm` - POST to confirm/finalize booking

**Authentication**: Cookie-based sessions. Login returns 302 redirect with Set-Cookie headers.

**HTML structure**:

- Matrix layout with 13 courts (Baan 1-13)
- Court names in `<thead> th.header-name>` text
- Court IDs in class `r-(\d+)` (e.g., `r-56` = court 56)
- Time rows: `<tr data-time="HH:MM">`
- Availability cells: `td.slot.free` (available) vs `td.slot.taken` (booked)
- Off-peak pricing: `.off-peak` class
- Date in `#matrix_date_title` element
