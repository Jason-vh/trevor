// Check court availability for cron job usage
// Usage: bun run check-availability.ts --start 17:00 --end 18:00 --days tue,wed

import { Bot } from 'grammy';
import { loadConfig } from './src/config';
import { login } from './src/modules/auth';
import { fetchPage } from './src/modules/scraper';
import { parseReservationsPage } from './src/modules/parser';
import { isSafeForTesting } from './src/modules/booking';
import { loadState, saveState, compareStates, updateState, pruneOldEntries } from './src/modules/state';
import type { Availability } from './src/types';

interface CliArgs {
  start: string; // HH:MM format
  end: string; // HH:MM format
  days: string[]; // ['tue', 'wed']
}

const DAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: Partial<CliArgs> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' && args[i + 1]) {
      result.start = args[i + 1];
      i++;
    } else if (args[i] === '--end' && args[i + 1]) {
      result.end = args[i + 1];
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      result.days = args[i + 1].split(',').map(d => d.trim().toLowerCase());
      i++;
    }
  }

  // Validate required arguments
  if (!result.start || !result.end || !result.days || result.days.length === 0) {
    console.error('Usage: bun run check-availability.ts --start HH:MM --end HH:MM --days mon,tue,...');
    console.error('Example: bun run check-availability.ts --start 17:00 --end 18:00 --days tue,wed');
    process.exit(1);
  }

  return result as CliArgs;
}

/**
 * Validate time format (HH:MM)
 */
function validateTime(time: string): boolean {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return timeRegex.test(time);
}

/**
 * Validate day names
 */
function validateDays(days: string[]): boolean {
  return days.every(day => day in DAY_MAP);
}

/**
 * Convert HH:MM to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current date/time in configured timezone
 */
function getNLDate(): Date {
  const now = new Date();
  const timezone = process.env.TZ || 'Europe/Amsterdam';
  const nlTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  return nlTime;
}

/**
 * Get next 7 days from today (NL timezone)
 */
function getNext7Days(): Date[] {
  const dates: Date[] = [];
  const today = getNLDate();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date);
  }

  return dates;
}

/**
 * Format date as YYYY-MM-DD (NL timezone)
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get day name from date (configured timezone)
 */
function getDayName(date: Date): string {
  const timezone = process.env.TZ || 'Europe/Amsterdam';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: timezone
  });
}

/**
 * Filter slots by time range
 */
function filterByTimeRange(slots: Availability[], startTime: string, endTime: string): Availability[] {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  return slots.filter(slot => {
    const slotMinutes = timeToMinutes(slot.timeSlot);
    return slotMinutes >= startMinutes && slotMinutes < endMinutes;
  });
}

/**
 * Group courts by time slot
 */
interface GroupedSlot {
  time: string;
  courts: string[];
  safe: boolean;
}

interface DayResults {
  dayName: string;
  dateString: string;
  slots: GroupedSlot[];
}

function groupByTime(slots: Availability[]): GroupedSlot[] {
  const timeMap = new Map<string, { courts: string[]; safe: boolean }>();

  for (const slot of slots) {
    const existing = timeMap.get(slot.timeSlot);
    const isSafe = isSafeForTesting(slot);

    if (existing) {
      existing.courts.push(slot.court);
      // If any slot is safe, mark the group as safe
      existing.safe = existing.safe || isSafe;
    } else {
      timeMap.set(slot.timeSlot, {
        courts: [slot.court],
        safe: isSafe,
      });
    }
  }

  // Convert to array and sort by time
  return Array.from(timeMap.entries())
    .map(([time, data]) => ({
      time,
      courts: data.courts,
      safe: data.safe,
    }))
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
}

/**
 * Format availability results for Telegram message
 */
function formatTelegramMessage(results: DayResults[], timeRange: string, days: string[]): string {
  if (results.length === 0) {
    return `🎾 *Trevor Court Availability*\n\n` +
           `No newly available slots found for ${timeRange} on ${days.join(', ')}.`;
  }

  let message = `🎾 *Trevor Court Availability*\n\n`;
  message += `✨ *New slots available!*\n`;
  message += `Time: ${timeRange}\n`;
  message += `Days: ${days.join(', ')}\n\n`;

  let totalSlots = 0;

  for (const day of results) {
    message += `*${day.dayName} ${day.dateString}*\n`;

    for (const slot of day.slots) {
      totalSlots++;
      const safetyIndicator = slot.safe ? '✅' : '⚠️';
      const courtsText = slot.courts.join(', ');
      message += `  ${slot.time} (45min) - ${courtsText} ${safetyIndicator}\n`;
    }

    message += '\n';
  }

  message += `📊 Total: ${totalSlots} newly available time slot${totalSlots !== 1 ? 's' : ''}`;

  return message;
}

/**
 * Send message via Telegram
 */
async function sendTelegramMessage(botToken: string, chatId: string, message: string): Promise<void> {
  const bot = new Bot(botToken);

  try {
    await bot.api.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    });
    console.log('✅ Message sent to Telegram\n');
  } catch (error) {
    console.error('⚠️  Failed to send Telegram message:', error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  // Parse and validate arguments
  const args = parseArgs();

  if (!validateTime(args.start) || !validateTime(args.end)) {
    console.error('Error: Invalid time format. Use HH:MM (e.g., 17:00)');
    process.exit(1);
  }

  if (!validateDays(args.days)) {
    console.error('Error: Invalid day names. Use: mon, tue, wed, thu, fri, sat, sun');
    process.exit(1);
  }

  console.log(`🔍 Checking availability: ${args.start}-${args.end} on ${args.days.join(', ')}\n`);

  // Load previous state and prune old entries
  let previousState = await loadState();
  previousState = pruneOldEntries(previousState);

  // Login
  const config = loadConfig();
  const session = await login(config);

  // Get next 7 days
  const allDates = getNext7Days();

  // Filter for requested days of week
  const requestedDayNumbers = args.days.map(day => DAY_MAP[day]);
  const targetDates = allDates.filter(date => requestedDayNumbers.includes(date.getDay()));

  if (targetDates.length === 0) {
    console.log('No matching days found in the next 7 days.');
    return;
  }

  // Check availability for each date
  const sportId = 15; // Squash
  const allCurrentSlots: Availability[] = [];

  for (const date of targetDates) {
    const dateString = formatDate(date);
    const dayName = getDayName(date);
    const url = `${config.targetUrl}/reservations/${dateString}/sport/${sportId}`;

    try {
      // Fetch and parse
      const html = await fetchPage(url, session);
      const allSlots = parseReservationsPage(html, dateString);

      // Filter by time range and store all matching slots
      const filteredSlots = filterByTimeRange(allSlots, args.start, args.end);
      allCurrentSlots.push(...filteredSlots);
    } catch (error) {
      console.error(`⚠️  Failed to fetch ${dayName} ${dateString}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Compare with previous state to find newly available slots
  const newlyAvailableSlots = compareStates(previousState, allCurrentSlots);

  // Update state with all current slots
  const newState = updateState(previousState, allCurrentSlots);
  await saveState(newState);

  // Group newly available slots by day for output
  const results: DayResults[] = [];

  if (newlyAvailableSlots.length > 0) {
    // Group by date
    const slotsByDate = new Map<string, Availability[]>();
    for (const slot of newlyAvailableSlots) {
      const existing = slotsByDate.get(slot.dateString);
      if (existing) {
        existing.push(slot);
      } else {
        slotsByDate.set(slot.dateString, [slot]);
      }
    }

    // Format for output
    for (const [dateString, slots] of slotsByDate) {
      const date = new Date(dateString);
      const dayName = getDayName(date);
      const grouped = groupByTime(slots);

      results.push({
        dayName,
        dateString,
        slots: grouped,
      });

      // Output to terminal
      console.log(`${dayName} ${dateString}`);
      for (const slot of grouped) {
        const safetyIndicator = slot.safe ? '✅' : '⚠️  (within 48h)';
        console.log(`  ${slot.time} (45min) - Courts: ${slot.courts.join(', ')} ${safetyIndicator}`);
      }
      console.log('');
    }
  }

  // Terminal summary
  const totalSlots = results.reduce((sum, day) => sum + day.slots.length, 0);

  if (totalSlots === 0) {
    console.log('No new slots available (all previously seen or still booked).');
  } else {
    console.log(`📊 Total: ${totalSlots} newly available time slot${totalSlots !== 1 ? 's' : ''}`);
  }

  // Send Telegram message only if new slots were found
  if (totalSlots > 0 && config.telegram?.botToken && config.telegram?.chatId) {
    const timeRange = `${args.start}-${args.end}`;
    const message = formatTelegramMessage(results, timeRange, args.days);
    await sendTelegramMessage(config.telegram.botToken, config.telegram.chatId, message);
  }
}

main().catch(console.error);
