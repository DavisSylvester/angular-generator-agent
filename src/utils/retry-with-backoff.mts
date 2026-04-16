import type { Logger } from 'winston';

export interface RetryOptions {
  /** Maximum number of attempts (including the first). */
  readonly maxAttempts: number;
  /** Base delay in ms before the first retry. Doubles on each subsequent attempt. */
  readonly baseDelayMs: number;
  /** Maximum delay in ms (caps exponential growth). */
  readonly maxDelayMs: number;
  /** Optional jitter factor (0–1). Adds random variance to delay. Default 0.25. */
  readonly jitter?: number;
  /** Human-readable label for log messages (e.g. "Dribbble search"). */
  readonly label: string;
}

/**
 * Retry an async operation with exponential backoff and jitter.
 *
 * Calls `fn` up to `maxAttempts` times. On failure, waits with
 * exponential backoff (base * 2^attempt) capped at `maxDelayMs`,
 * plus random jitter to avoid thundering-herd.
 *
 * Returns the first successful result or throws the last error.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  logger: Logger,
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs, label } = options;
  const jitter = options.jitter ?? 0.25;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (attempt === maxAttempts) {
        logger.error(`${label} failed after ${maxAttempts} attempts`, { error: errorMsg });
        break;
      }

      const exponentialDelay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitterMs = Math.round(exponentialDelay * jitter * Math.random());
      const delayMs = exponentialDelay + jitterMs;

      logger.warn(`${label} attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms`, {
        error: errorMsg,
        nextAttempt: attempt + 1,
        delayMs,
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
