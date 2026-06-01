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
  -> Bun process (HTTP server + Telegram webhook handler + croner-driven queue ticker)
  -> shared Postgres on the apps-net network (DB: trevor)
```

The queue ticker runs in-process via [`croner`](https://github.com/Hexagon/croner)
on the cron expression `*/5 * * * *`. It used to be a separate Railway
service (`bun run src/cron.ts`); that file is gone — the schedule and
the retry logic live in `src/scheduler-cron.ts` now.

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
| `TREVOR_DB_PASSWORD` | Password for the `trevor` role in the shared Postgres. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot login + allowed-chats list. |
| `WEBHOOK_SECRET` | Random token sent in `X-Telegram-Bot-Api-Secret-Token`; also doubles as `/history` bearer. |
| `ANTHROPIC_API_KEY` | LLM. |
| `SQUASH_CITY_USERNAME`, `SQUASH_CITY_PASSWORD` | SquashCity reservation site login. |
| `AXIOM_TOKEN` | Axiom log shipping. |
| `CALENDAR_WEBHOOK_URL` | Google Apps Script Calendar sync (optional). |
| `NODE_ENV`, `TZ` | Runtime config. |

## Deploy

Every push to `main`:

1. Runs on the self-hosted runner labeled `trevor-prod`.
2. Writes `.env.production` from GitHub Actions secrets.
3. Copies the checkout into `/home/exedev/apps/trevor`.
4. Builds the image.
5. **Migrations**: `docker compose run --rm app bunx drizzle-kit migrate`
   in a one-shot container. Failures leave the previous deploy serving.
6. Starts the app.
7. Reloads Caddy.

Telegram bot is set into **webhook mode** (`bot.api.setWebhook`) on
startup since `WEBHOOK_DOMAIN` is set. Telegram POSTs updates to
`/webhook` on this VM.

## Operations

```bash
ssh vhtm-eu.exe.xyz
cd /home/exedev/apps/trevor

docker compose ps
docker compose logs -f app

# Force a queue tick manually (skips the 5-min schedule):
docker compose exec app bun -e 'import("./src/modules/scheduler").then(m => m.processQueue(null as any))'

# Re-set Telegram webhook (e.g. after rotating WEBHOOK_SECRET):
docker compose restart app
```

## Database

```text
host: postgres (over the apps-net Docker network)
db:   trevor
user: trevor
```

DB administration runbooks live with the shared instance:
<https://github.com/Jason-vh/vhtm.eu/blob/main/infra/postgres/README.md>.
