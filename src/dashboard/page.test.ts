import { describe, expect, test } from "bun:test";

import { html } from "./html";
import { monthsBetween, renderDashboard } from "./page";

describe("html", () => {
  test("escapes interpolated values but not nested markup", () => {
    const court = `<b>"Baan" & 4</b>`;

    expect(html`<p>${court}${html`<i>${1}</i>`}</p>`.toString()).toBe(
      "<p>&lt;b&gt;&quot;Baan&quot; &amp; 4&lt;/b&gt;<i>1</i></p>",
    );
  });

  test("joins lists and leaves out empty values", () => {
    expect(html`${["a", "b"]}${null}${undefined}${false}`.toString()).toBe("ab");
  });
});

describe("monthsBetween", () => {
  test("covers every month up to the last date, each starting on Monday", () => {
    const months = monthsBetween("2026-11-20", "2027-01-31");

    expect(months.map((month) => [month.name, month.year])).toEqual([
      ["November", null],
      ["December", null],
      ["January", 2027],
    ]);
    // 1 November 2026 is a Sunday.
    expect(months[0].cells.slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(months[0].cells.at(-1)).toBe("2026-11-30");
  });
});

describe("renderDashboard", () => {
  const page = renderDashboard({
    today: "2026-11-01",
    until: "2026-12-31",
    sessions: [
      { date: "2026-11-05", timeFrom: "18:00", timeTo: "18:45", court: "Baan <12>", status: "booked" },
      { date: "2026-11-10", timeFrom: "18:30", timeTo: "19:00", court: null, status: "weekly" },
    ],
  });

  test("marks session days with their time, opening that day's details", () => {
    expect(page).toContain('class="day is-booked" data-details="day-2026-11-05"');
    expect(page).toContain('<span class="day-time">18:00</span>');
    expect(page).toContain('<dialog id="day-2026-11-05"');
    expect(page).toContain('class="day is-weekly" data-details="day-2026-11-10"');
  });

  test("puts the next booked court up top, escaped", () => {
    expect(page).toContain("Thursday 5 November, 18:00");
    expect(page).toContain("Baan &lt;12&gt;");
    expect(page).not.toContain("Baan <12>");
  });

  test("says when nothing is planned", () => {
    expect(renderDashboard({ today: "2026-11-01", until: "2026-12-31", sessions: [] })).toContain(
      "Nothing planned yet",
    );
  });
});
