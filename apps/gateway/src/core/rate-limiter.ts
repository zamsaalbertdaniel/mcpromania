import type { RedisPort } from './redis.js';

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

export class RedisRateLimiter {
  private readonly now: () => number;

  constructor(
    private readonly redis: RedisPort,
    private readonly options: RateLimiterOptions
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async consume(identity: string): Promise<RateLimitResult> {
    const now = this.now();
    const key = `mcpr:rl:${identity}`;
    const windowStart = now - this.options.windowMs;
    const member = `${now}:${Math.random().toString(16).slice(2)}`;
    const pipeline = this.redis.multi();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, member);
    pipeline.zcard(key);
    pipeline.pexpire(key, this.options.windowMs);
    pipeline.zrange(key, 0, 0, 'WITHSCORES');
    const results = await pipeline.exec();
    const count = Number(results?.[2]?.[1] ?? 0);
    const range = results?.[4]?.[1];
    const oldest = Array.isArray(range) && range.length >= 2 ? Number(range[1]) : now;
    const reset = Math.ceil((oldest + this.options.windowMs) / 1000);
    const allowed = count <= this.options.limit;
    return {
      allowed,
      limit: this.options.limit,
      remaining: Math.max(0, this.options.limit - count),
      reset,
    };
  }
}
