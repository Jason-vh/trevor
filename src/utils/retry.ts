// Retry logic with exponential backoff

export interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  exponentialBackoff?: boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, retryDelay, exponentialBackoff = true } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = exponentialBackoff
          ? retryDelay * Math.pow(2, attempt)
          : retryDelay;

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}