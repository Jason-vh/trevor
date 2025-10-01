// Temporary script to fetch and inspect booking form
import { login } from './modules/auth';
import { fetchPage } from './modules/scraper';
import { loadConfig } from './config';
import * as cheerio from 'cheerio';

async function main() {
  const config = loadConfig();
  const session = await login(config);

  // First, fetch reservations page to get real slot data
  const reservationsHtml = await fetchPage(config.reservationsUrl, session);
  const $ = cheerio.load(reservationsHtml);

  // Find first free slot with its time and slot ID
  let slotId: string | null = null;
  let timestamp: string | null = null;

  $('tr[utc]').each((i, row) => {
    if (slotId) return false; // Stop if we found one

    const $row = $(row);
    const utc = $row.attr('utc');

    $row.find('td.slot.free[slot]').each((j, cell) => {
      if (slotId) return false;

      const $cell = $(cell);
      slotId = $cell.attr('slot') || null;
      timestamp = utc || null;

      console.log('Found free slot:', { slotId, timestamp, time: $cell.find('.slot-period').text().trim() });
      return false;
    });
  });

  if (!slotId || !timestamp) {
    console.log('No free slots found!');
    return;
  }

  // Fetch booking form
  const bookingFormUrl = `${config.targetUrl}/reservations/make/${slotId}/${timestamp}`;
  console.log('Fetching booking form:', bookingFormUrl);

  const html = await fetchPage(bookingFormUrl, session);

  await Bun.write('booking-form.html', html);
  console.log('Saved to booking-form.html');

  // Show form fields
  const formMatch = html.match(/<form[^>]*>([\s\S]*?)<\/form>/);
  if (formMatch) {
    console.log('\nForm HTML snippet:\n', formMatch[0].substring(0, 1500));
  }
}

main();