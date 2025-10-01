// Scraper module - HTTP client with cookie injection

import type { Session } from '../../types';
import { ScraperError, ErrorCode } from '../../utils/errors';
import { logger } from '../../utils/logger';

export async function fetchPage(url: string, session: Session): Promise<string> {
  logger.info('scraper', 'Fetching page', { url });

  try {
    // Convert cookies array to Cookie header string
    const cookieHeader = session.cookies
      .map(cookie => cookie.split(';')[0]) // Take only the name=value part
      .join('; ');

    // Fetch the page with cookies
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    // Check for success status
    if (!response.ok) {
      // Get response body for error details
      const errorBody = await response.text();

      // Check if it's an auth issue (redirect to login)
      if (response.status === 401 || response.status === 403) {
        throw new ScraperError(
          'Session expired or unauthorized',
          ErrorCode.SESSION_EXPIRED,
          true // Can retry with new login
        );
      }

      throw new ScraperError(
        `HTTP ${response.status}: ${response.statusText} - ${errorBody.substring(0, 200)}`,
        ErrorCode.NETWORK_ERROR,
        true
      );
    }

    // Get HTML content
    const html = await response.text();

    logger.info('scraper', 'Page fetched successfully', {
      url,
      size: html.length
    });

    return html;
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    // Network or other errors
    throw new ScraperError(
      `Failed to fetch page: ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.NETWORK_ERROR,
      true
    );
  }
}