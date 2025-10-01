// Authentication module - handles login and session management

import type { Session, Config } from '../../types';
import { ScraperError, ErrorCode } from '../../utils/errors';
import { logger } from '../../utils/logger';

export async function login(config: Config): Promise<Session> {
  logger.info('auth', 'Attempting login', { url: config.loginUrl });

  try {
    // Prepare form data
    const formData = new URLSearchParams({
      username: config.credentials.username,
      password: config.credentials.password,
    });

    // Submit login request
    const response = await fetch(config.loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: formData.toString(),
      redirect: 'manual', // Handle redirects manually to capture cookies
    });

    // Extract cookies from Set-Cookie headers
    const cookies = response.headers.getSetCookie();

    if (cookies.length === 0) {
      throw new ScraperError(
        'No session cookies received from login response',
        ErrorCode.AUTH_FAILED,
        false
      );
    }

    // Check if login was successful (usually 302 redirect or 200 OK)
    if (response.status !== 302 && response.status !== 200) {
      throw new ScraperError(
        `Login failed with status ${response.status}`,
        ErrorCode.AUTH_FAILED,
        false
      );
    }

    // Create session object
    const session: Session = {
      cookies,
      expiresAt: new Date(Date.now() + config.options.sessionTimeout * 1000),
    };

    logger.info('auth', 'Login successful', {
      cookieCount: cookies.length,
      expiresAt: session.expiresAt
    });

    return session;
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    // Network or other errors
    throw new ScraperError(
      `Login request failed: ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.NETWORK_ERROR,
      true // Network errors are retryable
    );
  }
}

export function isSessionValid(session: Session): boolean {
  return session.expiresAt > new Date();
}