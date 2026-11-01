import { html, raw, type Html } from "@/dashboard/html";
import { addDaysISO } from "@/utils/datetime";
import type { SessionStatus, UpcomingSession, UpcomingSessions } from "@/utils/upcoming-sessions";

const styles = await Bun.file(new URL("./styles.css", import.meta.url)).text();

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const STATUS_ORDER: SessionStatus[] = ["booked", "queued", "weekly"];
const STATUS_LABELS: Record<SessionStatus, string> = { booked: "Booked", queued: "Queued", weekly: "Weekly" };

const OPEN_DETAILS_SCRIPT = `
for (const button of document.querySelectorAll("[data-details]")) {
  button.addEventListener("click", () => document.getElementById(button.dataset.details).showModal());
}
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", (event) => event.target === dialog && dialog.close());
}`;

type Month = { name: string; year: number | null; cells: (string | null)[] };

function dateOf(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00Z`);
}

function formatDate(dateISO: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(dateOf(dateISO));
}

function relativeDay(dateISO: string, today: string): string {
  if (dateISO === today) return "Today";
  if (dateISO === addDaysISO(today, 1)) return "Tomorrow";
  return formatDate(dateISO, { weekday: "long", day: "numeric", month: "long" });
}

function detailsId(dateISO: string): string {
  return `day-${dateISO}`;
}

function sessionDetail(session: UpcomingSession): string {
  if (session.status === "booked") return session.court ?? "";
  if (session.status === "queued") return "Looking for a court starting in this window";
  return "Queued when SquashCity is ready";
}

/** Every month from today's up to and including `until`'s, with blanks before the 1st to start weeks on Monday. */
export function monthsBetween(today: string, until: string): Month[] {
  const start = dateOf(today);
  const end = dateOf(until);
  const count = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;

  return Array.from({ length: count }, (_, offset) => {
    const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const firstISO = first.toISOString().slice(0, 10);

    const blanks: null[] = Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => null);
    const dates = Array.from({ length: daysInMonth }, (_, day) => addDaysISO(firstISO, day));
    const year = first.getUTCFullYear();

    return {
      name: formatDate(firstISO, { month: "long" }),
      year: year === start.getUTCFullYear() ? null : year,
      cells: [...blanks, ...dates],
    };
  });
}

function leadingSession(sessions: UpcomingSession[]): UpcomingSession | undefined {
  for (const status of STATUS_ORDER) {
    const session = sessions.find((each) => each.status === status);
    if (session) return session;
  }
}

function renderDay(dateISO: string | null, today: string, sessionsByDate: Map<string, UpcomingSession[]>): Html {
  if (!dateISO)
    return html`
      <span class="day blank"></span>
    `;

  const number = html`<span class="day-num">${dateOf(dateISO).getUTCDate()}</span>`;
  const todayClass = dateISO === today ? " today" : "";
  const lead = leadingSession(sessionsByDate.get(dateISO) ?? []);

  if (dateISO < today) return html`<span class="day past">${number}</span>`;
  if (!lead) return html`<span class="day${todayClass}">${number}</span>`;

  return html`<button type="button" class="day is-${lead.status}${todayClass}" data-details="${detailsId(dateISO)}">
    ${number}<span class="day-time">${lead.timeFrom}</span>
  </button>`;
}

function renderMonth(month: Month, today: string, sessionsByDate: Map<string, UpcomingSession[]>): Html {
  return html`<section class="month">
    <h2 class="month-name">${month.name}${month.year ? html` <span>${month.year}</span>` : ""}</h2>
    <div class="weekdays">${WEEKDAYS.map((weekday) => html`<span>${weekday}</span>`)}</div>
    <div class="grid">${month.cells.map((dateISO) => renderDay(dateISO, today, sessionsByDate))}</div>
  </section>`;
}

function renderNext(sessions: UpcomingSession[], today: string): Html {
  const booked = sessions.find((session) => session.status === "booked");
  const upcoming = booked ?? sessions[0];

  if (!upcoming) {
    return html`
      <section class="next">
        <div class="next-label">Up next</div>
        <div class="next-when">Nothing planned yet</div>
        <div class="next-detail">Ask Trevor in the chat to book a court</div>
      </section>
    `;
  }

  const label = booked ? "Up next" : `Up next · ${STATUS_LABELS[upcoming.status]}`;
  return html`<section class="next">
    <div class="next-label">${label}</div>
    <div class="next-when">${relativeDay(upcoming.date, today)}, ${upcoming.timeFrom}</div>
    <div class="next-detail">${sessionDetail(upcoming)}</div>
  </section>`;
}

function renderDetails(dateISO: string, sessions: UpcomingSession[], today: string): Html {
  return html`<dialog id="${detailsId(dateISO)}" class="details" aria-labelledby="${detailsId(dateISO)}-title">
    <div class="details-inner">
      <form method="dialog" class="details-header">
        <h2 id="${detailsId(dateISO)}-title" class="details-title">${relativeDay(dateISO, today)}</h2>
        <button class="details-close" aria-label="Close">×</button>
      </form>
      <ul class="sessions">
        ${sessions.map(
          (session) => html`<li class="session is-${session.status}">
            <span class="session-bar"></span>
            <div>
              <div class="session-status">${STATUS_LABELS[session.status]}</div>
              <div class="session-time">${session.timeFrom}–${session.timeTo}</div>
              <div class="session-detail">${sessionDetail(session)}</div>
            </div>
          </li>`,
        )}
      </ul>
    </div>
  </dialog>`;
}

function renderPage(main: Html, after: Html | string = ""): string {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="theme-color" content="#fafaf7" />
        <title>Trevor</title>
        <style>
          ${raw(styles)}
        </style>
      </head>
      <body>
        <main class="page">
          <header class="masthead">
            <div>
              <h1 class="brand">Trevor</h1>
              <div class="brand-sub">Squash at SquashCity</div>
            </div>
            <ul class="legend">
              <li><i class="swatch is-booked"></i>Booked</li>
              <li><i class="swatch is-queued"></i>Queued</li>
              <li><i class="swatch is-weekly"></i>Weekly</li>
            </ul>
          </header>
          ${main}
        </main>
        ${after}
      </body>
    </html>`.toString();
}

export function renderDashboard({ today, until, sessions }: UpcomingSessions): string {
  const sessionsByDate = new Map<string, UpcomingSession[]>();
  for (const session of sessions) {
    sessionsByDate.set(session.date, [...(sessionsByDate.get(session.date) ?? []), session]);
  }

  const months = monthsBetween(today, until);
  const main = html`${renderNext(sessions, today)}
    <div class="months">${months.map((month) => renderMonth(month, today, sessionsByDate))}</div>`;
  const details = html`${[...sessionsByDate].map(([dateISO, daySessions]) => renderDetails(dateISO, daySessions, today))}
    <script>
      ${raw(OPEN_DETAILS_SCRIPT)}
    </script>`;

  return renderPage(main, details);
}

export function renderUnavailable(): string {
  return renderPage(
    html`
      <p class="notice">Couldn't load the sessions. Try again in a minute.</p>
    `,
  );
}
