import type { Hono } from 'hono';

import type { AppEnv } from '../app-env.js';
import type { CircuitBreaker } from '../core/circuit-breaker.js';
import type { RedisPort } from '../core/redis.js';

export function registerHealthRoute(
  app: Hono<AppEnv>,
  deps: {
    redis: RedisPort;
    anafCircuit: CircuitBreaker;
    bnrCircuit: CircuitBreaker;
    justCircuit?: CircuitBreaker;
    insolvencyCircuit?: CircuitBreaker;
    masterApiKey?: string;
  }
): void {
  app.get('/health', async (c) => {
    let redis: 'up' | 'down' = 'down';
    try {
      redis = (await deps.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      redis = 'down';
    }
    const circuits: Record<string, string> = {
      anaf: deps.anafCircuit.getState(),
      bnr: deps.bnrCircuit.getState(),
    };
    if (deps.justCircuit) {
      circuits.just = deps.justCircuit.getState();
    }
    if (deps.insolvencyCircuit) {
      circuits.insolvency = deps.insolvencyCircuit.getState();
    }
    const degraded =
      redis === 'down' ||
      circuits.anaf === 'OPEN' ||
      circuits.bnr === 'OPEN' ||
      circuits.just === 'OPEN' ||
      circuits.insolvency === 'OPEN';

    // In production, unauthenticated public requests get a clean status without leaking internal topology.
    // Full diagnostic details (circuits + redis status) are available in test mode or with MASTER_API_KEY.
    const authHeader = c.req.header('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const isMaster = Boolean(deps.masterApiKey && token === deps.masterApiKey);
    const isTest = process.env.NODE_ENV === 'test';

    if (!isMaster && !isTest) {
      return c.json(
        {
          ok: !degraded,
          status: degraded ? 'degraded' : 'ok',
        },
        degraded ? 503 : 200
      );
    }

    return c.json({
      ok: true,
      status: degraded ? 'degraded' : 'ok',
      redis,
      circuits,
    });
  });
}
