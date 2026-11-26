import { AppError } from './errors.js';
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

export const CONSUME_RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local windowMs = tonumber(ARGV[4])
local member = ARGV[5]

if not now or not windowStart or not limit or not windowMs or limit < 1 or windowMs < 1 then
  return redis.error_reply('invalid rate limit arguments')
end

redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = now
  if oldest and #oldest >= 2 then
    oldestScore = tonumber(oldest[2]) or now
  end
  local reset = math.ceil((oldestScore + windowMs) / 1000)
  return {0, 0, reset}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)

local remaining = math.max(0, limit - (count + 1))
local oldestScore = now
if count > 0 then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  if oldest and #oldest >= 2 then
    oldestScore = tonumber(oldest[2]) or now
  end
end
local reset = math.ceil((oldestScore + windowMs) / 1000)
return {1, remaining, reset}
`;

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

    try {
      const result = await this.redis.eval(
        CONSUME_RATE_LIMIT_SCRIPT,
        1,
        key,
        now,
        windowStart,
        this.options.limit,
        this.options.windowMs,
        member
      );
      if (!Array.isArray(result) || result.length !== 3) {
        throw new Error('Invalid rate limit script response');
      }
      const [allowedValue, remainingValue, resetValue] = result.map(Number);
      if (![allowedValue, remainingValue, resetValue].every(Number.isFinite)) {
        throw new Error('Invalid rate limit script response');
      }
      return {
        allowed: allowedValue === 1,
        limit: this.options.limit,
        remaining: remainingValue,
        reset: resetValue,
      };
    } catch (error) {
      console.error('Rate limiter Redis error, failing closed:', error);
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Serviciul de limitare a traficului este temporar indisponibil'
      );
    }
  }
}
