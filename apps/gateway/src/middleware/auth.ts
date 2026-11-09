import { createHash } from 'node:crypto';

import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../app-env.js';
import type { GatewayEnv } from '../config/env.js';
import { AppError } from '../core/errors.js';
import type { RedisPort } from '../core/redis.js';
import type { SupabasePort } from '../core/supabase.js';
import type { AuthContext } from '../core/types.js';

const CachedAuthSchema = z.object({
  apiKeyId: z.string().uuid(),
  tenantId: z.string().uuid(),
  keyName: z.string().min(1),
});

export type AuthDeps = {
  redis: RedisPort;
  supabase: SupabasePort;
  env: GatewayEnv;
};

export function createAuthMiddleware(deps: AuthDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = readToken(c.req.header('authorization'), c.req.query('apiKey'));
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API lipsă');
    }
    const hash = createHash('sha256').update(token).digest('hex');
    const cacheKey = `mcpr:auth:${hash}`;
    const cached = await readCache(deps.redis, cacheKey);
    const auth = cached ?? (await deps.supabase.verifyApiKey(hash));
    if (!auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API invalidă');
    }
    if (!cached) {
      await deps.redis.set(cacheKey, JSON.stringify(auth), 'EX', deps.env.AUTH_CACHE_TTL_SECONDS);
    }
    c.set('auth', auth);
    await next();
  };
}

function readToken(authorization: string | undefined, apiKey: string | undefined): string | null {
  if (authorization) {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    if (match?.[1]) {
      return match[1];
    }
  }
  const queryKey = apiKey?.trim();
  return queryKey ? queryKey : null;
}

async function readCache(redis: RedisPort, key: string): Promise<AuthContext | null> {
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed = CachedAuthSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
