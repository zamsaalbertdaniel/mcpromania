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

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<void> {
    this.status = 'end';
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
