import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';

import type { AppEnv } from '../app-env.js';
import { buildError } from '../core/api-response.js';
import { AppError } from '../core/errors.js';

import { RateLimitError } from './rate-limit.js';

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  const startedAt = c.get('startedAt') ?? Date.now();
  const now = Date.now();

  if (error instanceof RateLimitError) {
    c.header('X-RateLimit-Limit', String(error.rateLimit.limit));
    c.header('X-RateLimit-Remaining', String(error.rateLimit.remaining));
    c.header('X-RateLimit-Reset', String(error.rateLimit.reset));
    return c.json(
      buildError({
        code: error.code,
        message: error.message,
        requestId,
        startedAt,
        now,
      }),
      429
    );
  }

  if (error instanceof AppError) {
    return c.json(
      buildError({
        code: error.code,
        message: error.message,
        requestId,
        startedAt,
        now,
        circuitStatus: error.code === 'CIRCUIT_OPEN' ? 'OPEN' : null,
      }),
      httpStatus(error.status)
    );
  }

  if (error instanceof ZodError) {
    return c.json(
      buildError({
        code: 'VALIDATION_ERROR',
        message: 'Date de intrare invalide',
        requestId,
        startedAt,
        now,
      }),
      400
    );
  }

  console.error(error instanceof Error ? error.message : 'unexpected error');
  return c.json(
    buildError({
      code: 'INTERNAL',
      message: 'Eroare internă',
      requestId,
      startedAt,
      now,
    }),
    500
  );
};

function httpStatus(status: number): 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503 {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 429:
    case 500:
    case 502:
    case 503:
      return status;
    default:
      return 500;
  }
}
