// Error handling utilities

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_FAILED = 'AUTH_FAILED',
  PARSE_ERROR = 'PARSE_ERROR',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  CONFIG_ERROR = 'CONFIG_ERROR',
}

export class ScraperError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}