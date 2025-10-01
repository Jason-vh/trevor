// Application entry point

import { logger } from './utils/logger';
import { loadConfig } from './config';
import { login, isSessionValid } from './modules/auth';
import { fetchPage } from './modules/scraper';
import { parseReservationsPage } from './modules/parser';
import { withRetry } from './utils/retry';
import { ScraperError } from './utils/errors';

async function main() {
  try {
    logger.info('main', 'Starting squash court booking scraper');

    const config = loadConfig();
    logger.info('main', 'Configuration loaded successfully');

    // Step 1: Login and get session
    logger.info('main', 'Authenticating...');
    const session = await withRetry(
      () => login(config),
      {
        maxRetries: config.options.maxRetries,
        retryDelay: config.options.retryDelay,
      }
    );

    if (!isSessionValid(session)) {
      throw new Error('Session is invalid after login');
    }

    logger.info('main', 'Authentication successful');

    // Step 2: Fetch reservations page
    logger.info('main', 'Fetching reservations page...');
    const html = await withRetry(
      () => fetchPage(config.reservationsUrl, session),
      {
        maxRetries: config.options.maxRetries,
        retryDelay: config.options.retryDelay,
      }
    );

    logger.info('main', 'Reservations page fetched successfully');

    // Step 3: Parse availability data
    logger.info('main', 'Parsing availability data...');
    const availabilities = parseReservationsPage(html);

    logger.info('main', 'Parsing complete', {
      availabilityCount: availabilities.length,
    });

    // Step 4: Display results
    if (availabilities.length === 0) {
      logger.info('main', 'No availability data found - HTML structure inspection needed');
      logger.info('main', 'Check logs for HTML sample to determine correct selectors');
    } else {
      logger.info('main', 'Available slots:', { availabilities });
    }

    logger.info('main', 'Application completed successfully');
  } catch (error) {
    if (error instanceof ScraperError) {
      logger.error('main', `Application failed: ${error.code}`, {
        message: error.message,
        retryable: error.retryable,
      });
    } else {
      logger.error('main', 'Application failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    process.exit(1);
  }
}

main();