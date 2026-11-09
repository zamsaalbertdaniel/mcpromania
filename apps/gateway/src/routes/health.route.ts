import type { Hono } from 'hono';

import type { AppEnv } from '../app-env.js';
import type { CircuitBreaker } from '../core/circuit-breaker.js';
import type { RedisPort } from '../core/redis.js';

export function registerHealthRoute(
  app: Hono<AppEnv>,
  deps: { redis: RedisPort; anafCircuit: CircuitBreaker; bnrCircuit: CircuitBreaker }
): void {
  app.get('/health', async (c) => {
    let redis: 'up' | 'down' = 'down';
    try {
      redis = (await deps.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      redis = 'down';
    }
    const circuits = {
      anaf: deps.anafCircuit.getState(),
      bnr: deps.bnrCircuit.getState(),
    };
    const degraded = redis === 'down' || circuits.anaf === 'OPEN' || circuits.bnr === 'OPEN';
    return c.json({
      ok: true,
      status: degraded ? 'degraded' : 'ok',
      redis,
      circuits,
    });
  });
}
