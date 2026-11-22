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
      console.warn('Quota limiter check error, failing open:', error);
      return {
        allowed: true,
        limit,
        used: 0,
        remaining: limit,
        reset,
      };
    }
  }

  async consume(identity: string, limit: number): Promise<QuotaResult> {
    const nowMs = this.now();
    const key = getMonthKey(identity, nowMs);
    const reset = getMonthResetTimestamp(nowMs);

    try {
      // 1. Check current usage
      const raw = await this.redis.get(key);
      const currentUsed = Number(raw ?? '0');

      if (currentUsed >= limit) {
        return {
          allowed: false,
          limit,
          used: currentUsed,
          remaining: 0,
          reset,
        };
      }

      // 2. Increment usage
      const newUsed = await this.redis.incr(key);
      if (newUsed === 1) {
        // Set TTL to 35 days so monthly stats persist past the end of the month
        await this.redis.expire(key, 35 * 86_400);
      }

      const allowed = newUsed <= limit;
      return {
        allowed,
        limit,
        used: newUsed,
        remaining: Math.max(0, limit - newUsed),
        reset,
      };
    } catch (error) {
      console.warn('Quota limiter Redis error, failing open:', error);
      return {
        allowed: true,
        limit,
        used: 0,
        remaining: limit,
        reset,
      };
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
