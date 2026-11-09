import { createApp, type GatewayDeps } from '../../src/app.js';
import type { GatewayEnv } from '../../src/config/env.js';
import type { RedisPort } from '../../src/core/redis.js';
import type { SupabasePort } from '../../src/core/supabase.js';

import { createSupabaseMock, testEnv } from './fixtures.js';
import { MemoryRedis } from './memory-redis.js';

export function createTestApp(
  overrides: {
    env?: Partial<GatewayEnv>;
    redis?: RedisPort;
    supabase?: SupabasePort;
    fetchImpl?: typeof fetch;
    now?: () => number;
    circuits?: GatewayDeps['circuits'];
  } = {}
) {
  const now = overrides.now ?? (() => Date.now());
  return createApp({
    env: { ...testEnv, ...overrides.env },
    redis: overrides.redis ?? new MemoryRedis(now),
    supabase: overrides.supabase ?? createSupabaseMock().port,
    fetchImpl:
      overrides.fetchImpl ??
      (async () => {
        throw new Error('unexpected network call');
      }),
    now,
    circuits: overrides.circuits,
  });
}
