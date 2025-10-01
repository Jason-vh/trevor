// Check court availability for cron job usage
// Usage: bun run check-availability.ts --start 17:00 --end 18:00 --days tue,wed

import { Bot } from 'grammy';
import { loadConfig } from './src/config';
import { login } from './src/modules/auth';
import { fetchPage } from './src/modules/scraper';
import { parseReservationsPage } from './src/modules/parser';
import { isSafeForTesting } from './src/modules/booking';
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
 * Get next 7 days from today
 */
function getNext7Days(): Date[] {
  const dates: Date[] = [];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date);
  }

  return dates;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get day name from date
 */
function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
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
           `No available slots found for ${timeRange} on ${days.join(', ')}.`;
  }

  let message = `🎾 *Trevor Court Availability*\n\n`;
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

  message += `📊 Total: ${totalSlots} time slot${totalSlots !== 1 ? 's' : ''} available`;

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
  const results: DayResults[] = [];

  for (const date of targetDates) {
    const dateString = formatDate(date);
    const dayName = getDayName(date);
    const url = `${config.targetUrl}/reservations/${dateString}/sport/${sportId}`;

    try {
      // Fetch and parse
      const html = await fetchPage(url, session);
      const allSlots = parseReservationsPage(html, dateString);

      // Filter by time range
      const filteredSlots = filterByTimeRange(allSlots, args.start, args.end);

      if (filteredSlots.length > 0) {
        // Group by time
        const grouped = groupByTime(filteredSlots);

        // Store results
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
    } catch (error) {
      console.error(`⚠️  Failed to fetch ${dayName} ${dateString}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Terminal summary
  const totalSlots = results.reduce((sum, day) => sum + day.slots.length, 0);

  if (totalSlots === 0) {
    console.log('No available slots found matching criteria.');
  } else {
    console.log(`📊 Total: ${totalSlots} time slots available`);
  }

  // Send Telegram message if configured
  if (config.telegram?.botToken && config.telegram?.chatId) {
    const timeRange = `${args.start}-${args.end}`;
    const message = formatTelegramMessage(results, timeRange, args.days);
    await sendTelegramMessage(config.telegram.botToken, config.telegram.chatId, message);
  } else {
    console.log('\n⚠️  Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
  }
}

main().catch(console.error);
