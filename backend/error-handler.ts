// ============ ERROR HANDLING & RETRY UTILITIES ============

import {
  type ClassifiedError,
  type ErrorType,
  type RetryConfig,
  DEFAULT_RETRY_CONFIG,
  ERROR_SELECTORS,
  sleep,
} from './config';

export { type ClassifiedError, type ErrorType };

export function classifyError(error: unknown): ClassifiedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = errorMessage.toLowerCase();

  // Network errors (retryable)
  if (errorString.includes('fetch') ||
      errorString.includes('network') ||
      errorString.includes('econnrefused') ||
      errorString.includes('enotfound') ||
      errorString.includes('socket') ||
      errorString.includes('connection')) {
    return { type: 'network', message: errorMessage, originalError: error, retryable: true };
  }

  // Timeout errors (retryable)
  if (errorString.includes('timeout') || errorString.includes('timed out')) {
    return { type: 'timeout', message: errorMessage, originalError: error, retryable: true };
  }

  // Rate limit errors (retryable with longer backoff)
  if (errorString.includes('rate limit') ||
      errorString.includes('429') ||
      errorString.includes('too many requests') ||
      errorString.includes('exceeded')) {
    return { type: 'rate_limit', message: errorMessage, originalError: error, retryable: true };
  }

  // Quote expired (retryable - get fresh quote)
  if (errorString.includes('quote') &&
      (errorString.includes('expired') || errorString.includes('stale'))) {
    return { type: 'quote_expired', message: errorMessage, originalError: error, retryable: true };
  }

  // ERC-4337 / account abstraction permanent errors (NOT retryable)
  if (errorString.includes('aa10') ||
      errorString.includes('aa23') ||
      errorString.includes('aa24') ||
      errorString.includes('aa25') ||
      errorString.includes('aa31') ||
      errorString.includes('aa33') ||
      errorString.includes('useroperation reverted') ||
      errorString.includes('out of gas') ||
      errorString.includes('signature error') ||
      errorString.includes('could not find an account') ||
      errorString.includes('not a valid hex address') ||
      errorString.includes('unrecognized key') ||
      errorString.includes('do not know how to serialize a bigint') ||
      errorString.includes('cannot serialize') ||
      errorString.includes('delegation missing signature') ||
      errorString.includes('invalid delegation')) {
    return { type: 'revert', message: errorMessage, originalError: error, retryable: false };
  }

  // Revert errors (NOT retryable - will fail again)
  if (errorString.includes('revert') ||
      errorString.includes('execution reverted') ||
      errorString.includes('insufficient') ||
      errorString.includes('transfer amount exceeds')) {
    return { type: 'revert', message: errorMessage, originalError: error, retryable: false };
  }

  // Unknown errors - NOT retryable by default (conservative approach)
  return { type: 'unknown', message: errorMessage, originalError: error, retryable: false };
}

export function decodeErrorSelector(errorData: string): string {
  if (!errorData || errorData.length < 10) return 'Unknown error';
  const selector = errorData.slice(0, 10).toLowerCase();
  
  // Check for CaveatViolated with index
  if (selector === '0xd81b2f2e' && errorData.length >= 74) {
    const caveatIndex = parseInt(errorData.slice(66, 74), 16);
    return `CaveatViolated - Caveat at index ${caveatIndex} failed enforcement`;
  }
  
  return ERROR_SELECTORS[selector] || `Unknown error selector: ${selector}`;
}

// Generic retry wrapper with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<{ result: T | null; error: ClassifiedError | null; attempts: number }> {
  const { maxAttempts, baseDelayMs, maxDelayMs, operation } = { ...DEFAULT_RETRY_CONFIG, ...config };

  let lastError: ClassifiedError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(`[${operation}] Succeeded on attempt ${attempt}`);
      }
      return { result, error: null, attempts: attempt };
    } catch (err) {
      lastError = classifyError(err);

      console.error(`[${operation}] Attempt ${attempt}/${maxAttempts} failed:`, {
        type: lastError.type,
        message: lastError.message,
        retryable: lastError.retryable,
      });

      // Don't retry non-retryable errors
      if (!lastError.retryable) {
        console.log(`[${operation}] Error is not retryable, giving up`);
        break;
      }

      // Don't sleep after the last attempt
      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        const jitter = delay * 0.2 * (Math.random() - 0.5);
        const actualDelay = Math.floor(delay + jitter);

        console.log(`[${operation}] Retrying in ${actualDelay}ms...`);
        await sleep(actualDelay);
      }
    }
  }

  return { result: null, error: lastError, attempts: maxAttempts };
}
