import { Hono } from 'hono';

import type { AppEnv } from './app-env.js';
import type { GatewayEnv } from './config/env.js';
import { buildError } from './core/api-response.js';
import { CircuitBreaker } from './core/circuit-breaker.js';
import { RedisRateLimiter } from './core/rate-limiter.js';
import type { RedisPort } from './core/redis.js';
import type { SupabasePort } from './core/supabase.js';
import { SwrCache } from './core/swr-cache.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import { registerHealthRoute } from './routes/health.route.js';
import { registerMcpRoute } from './routes/mcp/streamable.js';
import { registerAnafRoute } from './routes/rest/anaf.route.js';
import { registerBnrRoute } from './routes/rest/bnr.route.js';
import { createAnafService } from './services/anaf.service.js';
import { createBnrService } from './services/bnr.service.js';

export type { AppEnv } from './app-env.js';

export type GatewayDeps = {
  env: GatewayEnv;
  redis: RedisPort;
  supabase: SupabasePort;
  fetchImpl?: typeof fetch;
  now?: () => number;
  circuits?: {
    anaf: CircuitBreaker;
    bnr: CircuitBreaker;
  };
};

export function createApp(deps: GatewayDeps): Hono<AppEnv> {
  const now = deps.now ?? (() => Date.now());
  const fetchImpl = deps.fetchImpl ?? fetch;
  const anafCircuit =
    deps.circuits?.anaf ??
    new CircuitBreaker({
      threshold: deps.env.CIRCUIT_FAILURE_THRESHOLD,
      cooldownMs: deps.env.CIRCUIT_COOLDOWN_MS,
      now,
    });
  const bnrCircuit =
    deps.circuits?.bnr ??
    new CircuitBreaker({
      threshold: deps.env.CIRCUIT_FAILURE_THRESHOLD,
      cooldownMs: deps.env.CIRCUIT_COOLDOWN_MS,
      now,
    });
  const cache = new SwrCache(deps.redis, now);
  const anaf = createAnafService({
    cache,
    circuit: anafCircuit,
    fetchImpl,
    url: deps.env.ANAF_API_URL,
    timeoutMs: deps.env.REQUEST_TIMEOUT_MS,
    now,
  });
  const bnr = createBnrService({
    cache,
    circuit: bnrCircuit,
    fetchImpl,
    url: deps.env.BNR_XML_URL,
    timeoutMs: deps.env.REQUEST_TIMEOUT_MS,
    now,
  });
  const limiter = new RedisRateLimiter(deps.redis, {
    limit: deps.env.RATE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
    now,
  });
  const auth = createAuthMiddleware({
    redis: deps.redis,
    supabase: deps.supabase,
    env: deps.env,
  });
  const rateLimit = createRateLimitMiddleware(limiter);

  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('startedAt', now());
    await next();
  });

  registerHealthRoute(app, { redis: deps.redis, anafCircuit, bnrCircuit });

  app.use('/api/v1/*', auth);
  app.use('/api/v1/*', rateLimit);
  registerAnafRoute(app, { anaf, supabase: deps.supabase, now });
  registerBnrRoute(app, { bnr, supabase: deps.supabase, now });

  app.use('/mcp', auth);
  app.use('/mcp/*', auth);
  app.use('/mcp', rateLimit);
  app.use('/mcp/*', rateLimit);
  registerMcpRoute(app, { anaf, bnr, supabase: deps.supabase, now });

  app.notFound((c) => {
    return c.json(
      buildError({
        code: 'NOT_FOUND',
        message: 'Resursa nu există',
        requestId: c.get('requestId'),
        startedAt: c.get('startedAt'),
        now: now(),
      }),
      404
    );
  });

  return app;
}
