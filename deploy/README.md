# exe.dev deployment — trevor

```text
https://trevor.vhtm.eu
```

Squash-court Telegram bot hosted on the shared `vhtm-eu` VM. The arch
and conventions live in <https://github.com/Jason-vh/vhtm.eu>.

## Architecture

```text
Telegram, Browser, Google Calendar
  -> https://trevor.vhtm.eu
  -> exe.dev edge (TLS) -> vhtm-eu :8080 -> Caddy -> 127.0.0.1:3007
  -> Bun process (HTTP server + Telegram webhook + pi-durable agent + croner queue ticker)
  -> SQLite files on the `trevor_data` Docker volume
```

The queue ticker runs in-process via [`croner`](https://github.com/Hexagon/croner)
on the cron expression `*/5 * * * *` (`src/scheduler-cron.ts`).

## Files in this directory

| File | Purpose |
|---|---|
| `caddy.snippet` | Routing for `trevor.vhtm.eu` → `127.0.0.1:3007`. |
| `env.production.example` | Shape of `.env.production` (written by CI from secrets, not committed). |
| `README.md` | This file. |

## One-time exe.dev / DNS setup

```bash
ssh exe.dev domain add vhtm-eu trevor.vhtm.eu

# DNS (Porkbun, vhtm.eu zone):
#   trevor.vhtm.eu  CNAME  vhtm-eu.exe.xyz
```

## GitHub Actions secrets

| Secret | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot login + allowed-chats list. |
| `WEBHOOK_SECRET` | Random token sent in `X-Telegram-Bot-Api-Secret-Token`. |
| `ANTHROPIC_API_KEY` | LLM. |
| `SQUASH_CITY_USERNAME`, `SQUASH_CITY_PASSWORD` | SquashCity reservation site login. |
| `CALENDAR_WEBHOOK_URL` | Google Apps Script Calendar sync (optional). |
| `NODE_ENV`, `TZ` | Runtime config. |

## Deploy

Every push to `main`:

1. Runs on the self-hosted runner labeled `trevor-prod`.
2. Writes `.env.production` from GitHub Actions secrets.
3. Copies the checkout into `/home/exedev/apps/trevor`.
4. Builds the image.
5. Starts the app, which applies database migrations on startup.
6. Reloads Caddy.

Telegram bot is set into **webhook mode** (`bot.api.setWebhook`) on
startup since `WEBHOOK_DOMAIN` is set. Telegram POSTs updates to
`/webhook` on this VM.

## Data

Everything lives in two SQLite files on the `trevor_data` volume, mounted
at `/app/data`:

| File | Holds |
|---|---|
| `trevor.db` | Queue, scores, court preferences, metadata (Drizzle). |
| `conversations.db` | Trevor's conversations, one per chat (pi-durable). |

The deploy replaces `/home/exedev/apps/trevor` on every push, which is why
the data is on a named volume rather than in the checkout.

```bash
# Back up: stopping the app checkpoints the WAL, so the files are complete on their own.
docker compose stop app
docker compose cp app:/app/data ./trevor-data-backup
docker compose start app
```

### Moving off Postgres (one-time)

Trevor used to keep its data in the shared Postgres. After the first deploy
on SQLite, copy it over once:

```bash
docker compose exec -e POSTGRES_URL='postgresql://trevor:<password>@postgres:5432/trevor' \
  app bun run scripts/import-postgres.ts
```

It refuses to run if SQLite already has data. Once it has run, the
`trevor` database, its role and the `TREVOR_DB_PASSWORD` secret can go,
and so can the `apps-net` network in `docker-compose.yml`.

## Operations

```bash
ssh vhtm-eu.exe.xyz
cd /home/exedev/apps/trevor

docker compose ps
docker compose logs -f app

# Re-set Telegram webhook (e.g. after rotating WEBHOOK_SECRET):
docker compose restart app
```
