// Booking module - Automate court booking

import * as cheerio from 'cheerio';
import type { Session, BookingRequest, BookingResult, Availability } from '../../types';
import { ScraperError, ErrorCode } from '../../utils/errors';
import { logger } from '../../utils/logger';

const HOURS_48_IN_SECONDS = 48 * 60 * 60;

/**
 * Check if a slot is more than 48 hours in the future (safe for testing)
 */
export function isSafeForTesting(availability: Availability): boolean {
  const slotTimestamp = parseInt(availability.timestamp);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const diff = slotTimestamp - currentTimestamp;

  return diff >= HOURS_48_IN_SECONDS;
}

/**
 * Fetch booking form and extract CSRF token
 */
async function getBookingForm(
  baseUrl: string,
  courtId: string,
  timestamp: string,
  session: Session
): Promise<{ csrfToken: string; endTime: string; playerId: string; updatedCookies: string[] }> {
  const formUrl = `${baseUrl}/reservations/make/${courtId}/${timestamp}`;

  logger.info('booking', 'Fetching booking form', { formUrl });

  // Inject cookies into request
  const cookieHeader = session.cookies
    .map(cookie => cookie.split(';')[0])
    .join('; ');

  const response = await fetch(formUrl, {
    method: 'GET',
    headers: {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ScraperError(
      `Failed to fetch booking form: HTTP ${response.status} - ${text.substring(0, 100)}`,
      ErrorCode.NETWORK_ERROR,
      true
    );
  }

  // Capture any new cookies set by the server
  const newCookies = response.headers.getSetCookie();
  const updatedCookies = newCookies.length > 0 ? newCookies : session.cookies;

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract CSRF token
  const csrfToken = $('input[name="_token"]').val() as string;
  if (!csrfToken) {
    throw new ScraperError(
      'No CSRF token found in booking form',
      ErrorCode.PARSE_ERROR,
      false
    );
  }

  // Extract default end time from select dropdown
  const endTime = $('select[name="end_time"] option[selected]').val() as string ||
                  $('select[name="end_time"] option').first().val() as string ||
                  '';

  // Extract player ID from players[1] dropdown (logged-in user)
  const playerIdOption = $('select[name="players[1]"] option').first();
  const playerId = playerIdOption.val() as string || '';

  logger.info('booking', 'Booking form fetched', {
    csrfToken: csrfToken.substring(0, 10) + '...',
    endTime,
    playerId: playerId || 'none',
    newCookiesReceived: newCookies.length,
  });

  return { csrfToken, endTime, playerId, updatedCookies };
}

/**
 * Submit booking confirmation
 */
async function submitBooking(
  baseUrl: string,
  request: BookingRequest,
  csrfToken: string,
  cookies: string[],
  timestamp: string // Add timestamp for proper Referer
): Promise<BookingResult> {
  const confirmUrl = `${baseUrl}/reservations/confirm`;

  // Build form data
  const formData = new URLSearchParams({
    _token: csrfToken,
    resource_id: request.resourceId,
    date: request.date,
    start_time: request.startTime,
    end_time: request.endTime,
  });

  // Add players if provided
  if (request.players) {
    request.players.forEach((player, i) => {
      if (player) {
        formData.append(`players[${i + 1}]`, player);
      }
    });
  }

  logger.info('booking', 'Submitting booking', {
    url: confirmUrl,
    court: request.resourceId,
    date: request.date,
    time: `${request.startTime}-${request.endTime}`,
  });

  // Inject cookies (use updated cookies from form fetch)
  const cookieHeader = cookies
    .map(cookie => cookie.split(';')[0])
    .join('; ');

  const response = await fetch(confirmUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': `${baseUrl}/reservations/make/${request.resourceId}/${timestamp}`,
      'Origin': baseUrl,
    },
    body: formData.toString(),
    redirect: 'manual', // Handle redirects manually
  });

  logger.info('booking', 'Booking response received', {
    status: response.status,
    statusText: response.statusText,
  });

  // Parse response
  if (response.status === 302 || response.status === 303) {
    // Redirect typically means success
    const location = response.headers.get('location');
    logger.info('booking', 'Booking redirect (likely success)', { location });

    return {
      success: true,
      message: `Booking confirmed. Redirected to: ${location}`,
    };
  }

  if (response.status === 200) {
    // Check response body (could be HTML or plain text)
    const body = await response.text();

    logger.info('booking', 'HTTP 200 response body preview', {
      bodyStart: body.substring(0, 200),
      bodyLength: body.length,
    });

    // Check for plain text errors (like "Ongeldige input:")
    if (body.includes('Ongeldige input:') || body.includes('Error:')) {
      return {
        success: false,
        message: body.trim(),
      };
    }

    // Try parsing as HTML for error messages
    const $ = cheerio.load(body);
    const errorMsg = $('.error, .alert-danger').text().trim();
    if (errorMsg) {
      return {
        success: false,
        message: errorMsg,
      };
    }

    // HTTP 200 without redirect may not be real success
    logger.warn('booking', 'HTTP 200 without redirect - booking may not be confirmed');

    return {
      success: false,
      message: 'Uncertain status: Got HTTP 200 but no redirect. Check your reservations page to confirm.',
    };
  }

  // Error response
  const text = await response.text();
  return {
    success: false,
    message: `Booking failed: HTTP ${response.status} - ${text.substring(0, 200)}`,
  };
}

/**
 * Book a court slot
 */
export async function bookSlot(
  baseUrl: string,
  availability: Availability,
  session: Session,
  endTime?: string,
  players?: string[]
): Promise<BookingResult> {
  try {
    // Safety check: Only book slots 48+ hours in the future
    if (!isSafeForTesting(availability)) {
      const hoursUntil = (parseInt(availability.timestamp) - Math.floor(Date.now() / 1000)) / 3600;
      throw new ScraperError(
        `Safety check failed: Slot is only ${hoursUntil.toFixed(1)} hours away. ` +
        `Must be at least 48 hours in the future to avoid cancellation fees.`,
        ErrorCode.CONFIG_ERROR,
        false
      );
    }

    logger.info('booking', 'Starting booking process', {
      court: availability.court,
      date: availability.dateString,
      time: availability.timeSlot,
    });

    // Step 1: Get booking form with CSRF token (and updated cookies)
    const { csrfToken, endTime: defaultEndTime, playerId, updatedCookies } = await getBookingForm(
      baseUrl,
      availability.courtId,
      availability.timestamp,
      session
    );

    // Step 2: Submit booking (using updated cookies from form fetch)
    // If no players provided, use the logged-in user's ID for both player slots
    const defaultPlayers = playerId ? [playerId, playerId] : undefined;

    const bookingRequest: BookingRequest = {
      resourceId: availability.courtId,
      date: availability.dateString,
      startTime: availability.timeSlot,
      endTime: endTime || defaultEndTime,
      players: players || defaultPlayers,
    };

    const result = await submitBooking(baseUrl, bookingRequest, csrfToken, updatedCookies, availability.timestamp);

    logger.info('booking', 'Booking completed', {
      success: result.success,
      message: result.message,
    });

    return result;
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError(
      `Booking failed: ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.NETWORK_ERROR,
      true
    );
  }
}