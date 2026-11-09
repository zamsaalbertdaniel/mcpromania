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

    try {
      const checkPipeline = this.redis.multi();
      checkPipeline.zremrangebyscore(key, 0, windowStart);
      checkPipeline.zcard(key);
      checkPipeline.zrange(key, 0, 0, 'WITHSCORES');
      const results = await checkPipeline.exec();
      const count = Number(results?.[1]?.[1] ?? 0);
      const range = results?.[2]?.[1];
      const oldest = Array.isArray(range) && range.length >= 2 ? Number(range[1]) : now;
      const reset = Math.ceil((oldest + this.options.windowMs) / 1000);

      if (count >= this.options.limit) {
        return {
          allowed: false,
          limit: this.options.limit,
          remaining: 0,
          reset,
        };
      }

      const member = `${now}:${Math.random().toString(16).slice(2)}`;
      const addPipeline = this.redis.multi();
      addPipeline.zadd(key, now, member);
      addPipeline.pexpire(key, this.options.windowMs);
      await addPipeline.exec();

      return {
        allowed: true,
        limit: this.options.limit,
        remaining: Math.max(0, this.options.limit - (count + 1)),
        reset: count === 0 ? Math.ceil((now + this.options.windowMs) / 1000) : reset,
      };
    } catch (error) {
      console.warn('Rate limiter Redis error, failing open:', error);
      return {
        allowed: true,
        limit: this.options.limit,
        remaining: this.options.limit,
        reset: Math.ceil((now + this.options.windowMs) / 1000),
      };
    }
  }
}
