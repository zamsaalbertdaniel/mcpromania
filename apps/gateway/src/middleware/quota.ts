import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../app-env.js';
import { AppError } from '../core/errors.js';
import type { QuotaResult, RedisQuotaLimiter } from '../core/quota-limiter.js';

export class MonthlyQuotaError extends AppError {
  readonly quota: QuotaResult;
  readonly planTier: string;

  constructor(quota: QuotaResult, planTier: string) {
    super(
      429,
      'MONTHLY_QUOTA_EXCEEDED',
      `Ați atins limita lunară de ${quota.limit.toLocaleString('ro-RO')} cereri pentru planul ${planTier.toUpperCase()}. Pentru a continua, faceți upgrade la un plan superior pe mcpromania.ro.`
    );
    this.name = 'MonthlyQuotaError';
    this.quota = quota;
    this.planTier = planTier;
  }
}

export function createQuotaMiddleware(limiter: RedisQuotaLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }

    const result = await limiter.consume(auth.apiKeyId, auth.monthlyLimit);
    setQuotaHeaders(c, result);

    if (!result.allowed) {
      throw new MonthlyQuotaError(result, auth.planTier);
    }

    await next();
  };
}

export function setQuotaHeaders(
  c: { header: (name: string, value: string) => void },
  result: QuotaResult
): void {
  c.header('X-Quota-Limit', String(result.limit));
  c.header('X-Quota-Remaining', String(result.remaining));
  c.header('X-Quota-Used', String(result.used));
  c.header('X-Quota-Reset', String(result.reset));
}
