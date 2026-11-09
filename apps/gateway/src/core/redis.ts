import { Redis } from 'ioredis';

export type RedisPipeline = {
  zremrangebyscore(key: string, min: number | string, max: number | string): RedisPipeline;
  zadd(key: string, score: number, member: string): RedisPipeline;
  zcard(key: string): RedisPipeline;
  pexpire(key: string, milliseconds: number): RedisPipeline;
  zrange(key: string, start: number, stop: number, mode: 'WITHSCORES'): RedisPipeline;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
};

export interface RedisPort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  ping(): Promise<string>;
  quit(): Promise<void>;
  readonly status: string;
  multi(): RedisPipeline;
}

export function createRedis(url: string): RedisPort {
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('error', (err) => {
    console.error('Redis connection error:', err instanceof Error ? err.message : String(err));
  });

  return {
    get status() {
      return client.status;
    },
    get: (key) => client.get(key),
    set: (key, value, mode, ttlSeconds) => client.set(key, value, mode, ttlSeconds),
    ping: () => client.ping(),
    quit: async () => {
      await client.quit();
    },
    multi: () => client.multi() as unknown as RedisPipeline,
  };
}
