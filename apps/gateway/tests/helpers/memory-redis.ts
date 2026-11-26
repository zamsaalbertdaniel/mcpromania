import type { RedisPipeline, RedisPort } from '../../src/core/redis.js';

type StringEntry = { value: string; expiresAt: number | null };

export class MemoryRedis implements RedisPort {
  status = 'ready';

  private readonly strings = new Map<string, StringEntry>();

  private readonly zsets = new Map<string, Map<string, number>>();

  private readonly zsetExpiry = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    const entry = this.strings.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.strings.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, _mode: 'EX', ttlSeconds: number): Promise<string> {
    this.strings.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const deleted = this.strings.delete(key) ? 1 : 0;
    this.zsets.delete(key);
    this.zsetExpiry.delete(key);
    return deleted;
  }

  async incr(key: string): Promise<number> {
    const entry = this.strings.get(key);
    let next = 1;
    let expiresAt: number | null = null;
    if (entry) {
      if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
        next = 1;
      } else {
        next = Number(entry.value) + 1;
        expiresAt = entry.expiresAt;
      }
    }
    this.strings.set(key, { value: String(next), expiresAt });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.strings.get(key);
    if (!entry) {
      return 0;
    }
    this.strings.set(key, { value: entry.value, expiresAt: this.now() + seconds * 1000 });
    return 1;
  }

  async eval(
    script: string,
    numberOfKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown> {
    if (script.includes('ZREMRANGEBYSCORE')) {
      if (numberOfKeys !== 1 || args.length !== 6) {
        throw new Error('Unexpected rate limit script arguments');
      }
      const [keyArg, nowArg, windowStartArg, limitArg, windowMsArg, memberArg] = args;
      const key = String(keyArg);
      const now = Number(nowArg);
      const windowStart = Number(windowStartArg);
      const limit = Number(limitArg);
      const windowMs = Number(windowMsArg);
      const member = String(memberArg);

      if (
        !Number.isFinite(now) ||
        !Number.isFinite(windowStart) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        !Number.isInteger(windowMs) ||
        windowMs < 1
      ) {
        throw new Error('Invalid rate limit script arguments');
      }

      this.zremrangebyscore(key, 0, windowStart);
      const count = this.zcard(key);
      if (count >= limit) {
        const range = this.zrange(key, 0, 0);
        const oldestScore = range.length >= 2 ? Number(range[1]) : now;
        const reset = Math.ceil((oldestScore + windowMs) / 1000);
        return [0, 0, reset];
      }

      this.zadd(key, now, member);
      this.zsetExpiry.set(key, this.now() + windowMs);

      const remaining = Math.max(0, limit - (count + 1));
      let oldestScore = now;
      if (count > 0) {
        const range = this.zrange(key, 0, 0);
        if (range.length >= 2) {
          oldestScore = Number(range[1]);
        }
      }
      const reset = Math.ceil((oldestScore + windowMs) / 1000);
      return [1, remaining, reset];
    }

    if (numberOfKeys !== 1 || args.length !== 3) {
      throw new Error('Unexpected quota script arguments');
    }
    const [keyArg, limitArg, ttlArg] = args;
    const key = String(keyArg);
    const limit = Number(limitArg);
    const ttl = Number(ttlArg);
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(ttl) || ttl < 1) {
      throw new Error('Invalid quota script arguments');
    }
    const entry = this.strings.get(key);
    if (
      entry?.expiresAt !== null &&
      entry?.expiresAt !== undefined &&
      entry.expiresAt <= this.now()
    ) {
      this.strings.delete(key);
    }
    const current = Number(this.strings.get(key)?.value ?? '0');
    if (current >= limit) return [0, current, 0];
    const used = current + 1;
    const expiresAt =
      used === 1 ? this.now() + ttl * 1000 : (this.strings.get(key)?.expiresAt ?? null);
    this.strings.set(key, { value: String(used), expiresAt });
    return [1, used, Math.max(0, limit - used)];
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<void> {
    this.status = 'end';
  }

  clear(): void {
    this.strings.clear();
    this.zsets.clear();
    this.zsetExpiry.clear();
  }

  multi(): RedisPipeline {
    const operations: Array<() => unknown> = [];
    const pipeline: RedisPipeline = {
      zremrangebyscore: (key, min, max) => {
        operations.push(() => this.zremrangebyscore(key, Number(min), Number(max)));
        return pipeline;
      },
      zadd: (key, score, member) => {
        operations.push(() => this.zadd(key, score, member));
        return pipeline;
      },
      zcard: (key) => {
        operations.push(() => this.zcard(key));
        return pipeline;
      },
      pexpire: (key, milliseconds) => {
        operations.push(() => {
          this.zsetExpiry.set(key, this.now() + milliseconds);
          return 1;
        });
        return pipeline;
      },
      zrange: (key, start, stop) => {
        operations.push(() => this.zrange(key, start, stop));
        return pipeline;
      },
      exec: async () => operations.map((operation) => [null, operation()]),
    };
    return pipeline;
  }

  private expireZset(key: string): void {
    const expiry = this.zsetExpiry.get(key);
    if (expiry !== undefined && expiry <= this.now()) {
      this.zsets.delete(key);
      this.zsetExpiry.delete(key);
    }
  }

  private zremrangebyscore(key: string, min: number, max: number): number {
    this.expireZset(key);
    const set = this.zsets.get(key);
    if (!set || min > max) {
      return 0;
    }
    let removed = 0;
    for (const [member, score] of set) {
      if (score >= min && score <= max) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  private zadd(key: string, score: number, member: string): number {
    this.expireZset(key);
    const set = this.zsets.get(key) ?? new Map<string, number>();
    const existed = set.has(member);
    set.set(member, score);
    this.zsets.set(key, set);
    return existed ? 0 : 1;
  }

  private zcard(key: string): number {
    this.expireZset(key);
    return this.zsets.get(key)?.size ?? 0;
  }

  private zrange(key: string, start: number, stop: number): string[] {
    this.expireZset(key);
    const entries = [...(this.zsets.get(key)?.entries() ?? [])].sort(
      (left, right) => left[1] - right[1]
    );
    const end = stop < 0 ? entries.length + stop : stop;
    return entries.slice(start, end + 1).flatMap(([member, score]) => [member, String(score)]);
  }
}
