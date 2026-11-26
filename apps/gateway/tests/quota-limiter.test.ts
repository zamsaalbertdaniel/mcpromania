import { describe, expect, it } from 'vitest';

import {
  getMonthKey,
  getMonthResetTimestamp,
  RedisQuotaLimiter,
} from '../src/core/quota-limiter.js';
import type { RedisPort } from '../src/core/redis.js';

import { MemoryRedis } from './helpers/memory-redis.js';

describe('RedisQuotaLimiter', () => {
  it('correctly formats monthly key and reset timestamp', () => {
    // 2026-11-15T12:00:00Z
    const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
    const key = getMonthKey('test-key-id', nowMs);
    expect(key).toBe('mcpr:quota:test-key-id:2026-11');

    const reset = getMonthResetTimestamp(nowMs);
    // Reset should be start of 2026-12-01T00:00:00Z in seconds
    const expectedReset = Math.floor(Date.UTC(2026, 11, 1, 0, 0, 0) / 1000);
    expect(reset).toBe(expectedReset);
  });

  it('allows requests within quota and decrements remaining', async () => {
    const clock = { value: Date.UTC(2026, 10, 1, 10, 0, 0) };
    const redis = new MemoryRedis(() => clock.value);
    const limiter = new RedisQuotaLimiter(redis, { now: () => clock.value });

    // Free tier: 100 limit
    const check1 = await limiter.check('key_1', 100);
    expect(check1.allowed).toBe(true);
    expect(check1.used).toBe(0);
    expect(check1.remaining).toBe(100);

    const res1 = await limiter.consume('key_1', 100);
    expect(res1.allowed).toBe(true);
    expect(res1.used).toBe(1);
    expect(res1.remaining).toBe(99);

    const res2 = await limiter.consume('key_1', 100);
    expect(res2.allowed).toBe(true);
    expect(res2.used).toBe(2);
    expect(res2.remaining).toBe(98);
  });

  it('rejects requests when monthly limit is reached', async () => {
    const clock = { value: Date.UTC(2026, 10, 1, 10, 0, 0) };
    const redis = new MemoryRedis(() => clock.value);
    const limiter = new RedisQuotaLimiter(redis, { now: () => clock.value });

    const limit = 5;
    for (let i = 1; i <= limit; i += 1) {
      const res = await limiter.consume('key_limited', limit);
      expect(res.allowed).toBe(true);
      expect(res.used).toBe(i);
      expect(res.remaining).toBe(limit - i);
    }

    // 6th call should be blocked
    const blocked = await limiter.consume('key_limited', limit);
    expect(blocked.allowed).toBe(false);
    expect(blocked.used).toBe(limit);
    expect(blocked.remaining).toBe(0);

    // Further check also shows blocked
    const checkBlocked = await limiter.check('key_limited', limit);
    expect(checkBlocked.allowed).toBe(false);
    expect(checkBlocked.remaining).toBe(0);
  });

  it('resets quota when calendar month changes', async () => {
    const clock = { value: Date.UTC(2026, 10, 28, 23, 59, 0) }; // Late November
    const redis = new MemoryRedis(() => clock.value);
    const limiter = new RedisQuotaLimiter(redis, { now: () => clock.value });

    // Consume all 3 available requests in November
    const limit = 3;
    await limiter.consume('key_monthly', limit);
    await limiter.consume('key_monthly', limit);
    await limiter.consume('key_monthly', limit);

    const blockedNov = await limiter.consume('key_monthly', limit);
    expect(blockedNov.allowed).toBe(false);

    // Advance clock to December 1st
    clock.value = Date.UTC(2026, 11, 1, 0, 1, 0);

    // New month -> fresh quota!
    const allowedDec = await limiter.consume('key_monthly', limit);
    expect(allowedDec.allowed).toBe(true);
    expect(allowedDec.used).toBe(1);
    expect(allowedDec.remaining).toBe(2);
  });

  it('enforces quota atomically under concurrent requests', async () => {
    const redis = new MemoryRedis();
    const limiter = new RedisQuotaLimiter(redis);
    const results = await Promise.all(
      Array.from({ length: 30 }, () => limiter.consume('key_concurrent', 10))
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(20);
    expect(Math.max(...results.map((result) => result.used))).toBe(10);
  });

  it('fails closed with 503 when Redis errors', async () => {
    const failingRedis: RedisPort = {
      status: 'ready',
      get: async () => {
        throw new Error('Redis down');
      },
      set: async () => {
        throw new Error('Redis down');
      },
      del: async () => {
        throw new Error('Redis down');
      },
      incr: async () => {
        throw new Error('Redis down');
      },
      expire: async () => {
        throw new Error('Redis down');
      },
      eval: async () => {
        throw new Error('Redis down');
      },
      ping: async () => 'PONG',
      quit: async () => {},
      multi: () => {
        throw new Error('Redis down');
      },
    };

    const limiter = new RedisQuotaLimiter(failingRedis);
    await expect(limiter.consume('key_failclosed', 100)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    await expect(limiter.check('key_failclosed', 100)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
