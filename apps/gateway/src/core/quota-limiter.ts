import { AppError } from './errors.js';
import type { RedisPort } from './redis.js';

export type QuotaResult = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds for start of next month
};

export type QuotaLimiterOptions = {
  now?: () => number;
};

export const CONSUME_QUOTA_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
if not current or not limit or not ttl or limit < 1 or ttl < 1 then
  return redis.error_reply('invalid quota arguments')
end
if current >= limit then
  return {0, current, 0}
end
local used = redis.call('INCR', KEYS[1])
if used == 1 then
  redis.call('EXPIRE', KEYS[1], ttl)
end
return {1, used, math.max(0, limit - used)}
`;

export class RedisQuotaLimiter {
  private readonly now: () => number;

  constructor(
    private readonly redis: RedisPort,
    options?: QuotaLimiterOptions
  ) {
    this.now = options?.now ?? (() => Date.now());
  }

  async check(identity: string, limit: number): Promise<QuotaResult> {
    const nowMs = this.now();
    const key = getMonthKey(identity, nowMs);
    const reset = getMonthResetTimestamp(nowMs);

    try {
      const raw = await this.redis.get(key);
      const used = Number(raw ?? '0');
      const allowed = used < limit;

      return {
        allowed,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        reset,
      };
    } catch (error) {
      console.error('Quota limiter check error, failing closed:', error);
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Serviciul de verificare a cotei este temporar indisponibil'
      );
    }
  }

  async consume(identity: string, limit: number): Promise<QuotaResult> {
    const nowMs = this.now();
    const key = getMonthKey(identity, nowMs);
    const reset = getMonthResetTimestamp(nowMs);

    try {
      const result = await this.redis.eval(CONSUME_QUOTA_SCRIPT, 1, key, limit, 35 * 86_400);
      if (!Array.isArray(result) || result.length !== 3) {
        throw new Error('Invalid quota script response');
      }
      const [allowedValue, usedValue, remainingValue] = result.map(Number);
      if (![allowedValue, usedValue, remainingValue].every(Number.isFinite)) {
        throw new Error('Invalid quota script response');
      }
      return {
        allowed: allowedValue === 1,
        limit,
        used: usedValue,
        remaining: remainingValue,
        reset,
      };
    } catch (error) {
      console.error('Quota limiter Redis error, failing closed:', error);
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Serviciul de verificare a cotei este temporar indisponibil'
      );
    }
  }
}

export function getMonthResetTimestamp(nowMs: number): number {
  const d = new Date(nowMs);
  const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
  return Math.floor(nextMonth.getTime() / 1000);
}

export function getMonthKey(identity: string, nowMs: number): string {
  const d = new Date(nowMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `mcpr:quota:${identity}:${yyyy}-${mm}`;
}
