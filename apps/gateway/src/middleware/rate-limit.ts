import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../app-env.js';
import { AppError } from '../core/errors.js';
import type { RateLimitResult, RedisRateLimiter } from '../core/rate-limiter.js';

export class RateLimitError extends AppError {
  readonly rateLimit: RateLimitResult;

  constructor(rateLimit: RateLimitResult) {
    super(429, 'RATE_LIMITED', 'Limită de cereri depășită');
    this.name = 'RateLimitError';
    this.rateLimit = rateLimit;
  }
}

export function createRateLimitMiddleware(limiter: RedisRateLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    const result = await limiter.consume(auth.apiKeyId);
    setRateLimitHeaders(c, result);
    if (!result.allowed) {
      throw new RateLimitError(result);
    }
    await next();
  };
}

function setRateLimitHeaders(
  c: { header: (name: string, value: string) => void },
  result: RateLimitResult
): void {
  c.header('X-RateLimit-Limit', String(result.limit));
  c.header('X-RateLimit-Remaining', String(result.remaining));
  c.header('X-RateLimit-Reset', String(result.reset));
}
