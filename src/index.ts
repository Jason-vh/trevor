// Application entry point

import { createLogger } from './utils/logger';
import { loadConfig } from './config';
import { login, isSessionValid } from './modules/auth';
import { fetchPage } from './modules/scraper';
import { parseReservationsPage } from './modules/parser';
import { withRetry } from './utils/retry';
import { ScraperError } from './utils/errors';

const logger = createLogger('main');

async function main() {
  try {
    logger.info('Starting squash court booking scraper');

    const config = loadConfig();
    logger.info('Configuration loaded successfully');

    // Step 1: Login and get session
    logger.info('Authenticating...');
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

    logger.info('Authentication successful');

    // Step 2: Fetch reservations page
    logger.info('Fetching reservations page...');
    const html = await withRetry(
      () => fetchPage(config.reservationsUrl, session),
      {
        maxRetries: config.options.maxRetries,
        retryDelay: config.options.retryDelay,
      }
    );

    logger.info('Reservations page fetched successfully');

    // Step 3: Parse availability data
    logger.info('Parsing availability data...');
    const availabilities = parseReservationsPage(html);

    logger.info('Parsing complete', {
      availabilityCount: availabilities.length,
    });

    // Step 4: Display results
    if (availabilities.length === 0) {
      logger.info('No availability data found - HTML structure inspection needed');
      logger.info('Check logs for HTML sample to determine correct selectors');
    } else {
      logger.info('Available slots:', { availabilities });
    }

    logger.info('Application completed successfully');
  } catch (error) {
    if (error instanceof ScraperError) {
      logger.error(`Application failed: ${error.code}`, {
        message: error.message,
        retryable: error.retryable,
      });
    } else {
      logger.error('Application failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    process.exit(1);
  }
}

main();