import { createHash } from 'node:crypto';

import { PlanTierSchema } from '@mcpromania/types';
import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../app-env.js';
import type { GatewayEnv } from '../config/env.js';
import { AppError } from '../core/errors.js';
import type { RedisPort } from '../core/redis.js';
import { extractBearerToken } from '../core/security.js';
import type { SupabasePort } from '../core/supabase.js';
import type { AuthContext } from '../core/types.js';

const CachedAuthSchema = z.object({
  apiKeyId: z.string().uuid(),
  tenantId: z.string().uuid(),
  keyName: z.string().min(1),
  planTier: PlanTierSchema,
  monthlyLimit: z.number().int().positive(),
});

export type AuthDeps = {
  redis: RedisPort;
  supabase: SupabasePort;
  env: GatewayEnv;
};

export function createAuthMiddleware(deps: AuthDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const clientIp =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-real-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      'unknown';

    // Anti-brute-force: check failed authentication attempts from this IP (max 10 / 60s)
    if (clientIp !== 'unknown') {
      try {
        const failCount = await deps.redis.get(`mcpr:auth:failed:${clientIp}`);
        if (Number(failCount ?? '0') >= 10) {
          throw new AppError(
            429,
            'RATE_LIMIT_EXCEEDED',
            'Prea multe încercări eșuate de autentificare de pe acest IP. Reîncercați în 60 de secunde.'
          );
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
      }
    }

    // P1 #4: Only accept Authorization: Bearer <token>. Query string ?apiKey= is strictly disabled.
    const token = extractBearerToken(c.req.header('authorization'));
    if (!token) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Cheie API lipsă. Trimiteți cheia prin header-ul Authorization: Bearer <cheie>.'
      );
    }

    const hash = createHash('sha256').update(token).digest('hex');

    // Negative cache check: fail fast on recently rejected invalid keys
    const invalidCacheKey = `mcpr:auth:invalid:${hash}`;
    try {
      const isKnownInvalid = await deps.redis.get(invalidCacheKey);
      if (isKnownInvalid) {
        if (clientIp !== 'unknown') {
          await recordFailedAuth(deps.redis, clientIp);
        }
        throw new AppError(401, 'UNAUTHORIZED', 'Cheie API invalidă');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }

    const cacheKey = `mcpr:auth:${hash}`;
    const cached = await readCache(deps.redis, cacheKey);
    const auth = cached ?? (await deps.supabase.verifyApiKey(hash));

    if (!auth) {
      // Store negative cache for 30s to shield Supabase from brute-force
      try {
        await deps.redis.set(invalidCacheKey, '1', 'EX', 30);
      } catch (err) {
        console.warn('Negative auth cache write failed:', err);
      }
      if (clientIp !== 'unknown') {
        await recordFailedAuth(deps.redis, clientIp);
      }
      throw new AppError(401, 'UNAUTHORIZED', 'Cheie API invalidă');
    }

    // P1 #5: Instant Revocation check
    try {
      const isRevoked = await deps.redis.get(`mcpr:auth:revoked:${auth.apiKeyId}`);
      if (isRevoked) {
        await deps.redis.del(cacheKey);
        throw new AppError(401, 'UNAUTHORIZED', 'Cheia API a fost revocată');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }

    if (!cached) {
      try {
        await deps.redis.set(cacheKey, JSON.stringify(auth), 'EX', deps.env.AUTH_CACHE_TTL_SECONDS);
      } catch (error) {
        console.warn('Auth cache write failed, continuing without cache:', error);
      }
    }

    c.set('auth', auth);
    await next();
  };
}

export async function revokeApiKey(
  redis: RedisPort,
  options: { apiKeyId?: string; keyHash?: string }
): Promise<void> {
  if (options.keyHash) {
    await redis.del(`mcpr:auth:${options.keyHash}`);
    await redis.set(`mcpr:auth:invalid:${options.keyHash}`, '1', 'EX', 86_400);
  }
  if (options.apiKeyId) {
    await redis.set(`mcpr:auth:revoked:${options.apiKeyId}`, '1', 'EX', 86_400);
  }
}

async function recordFailedAuth(redis: RedisPort, ip: string): Promise<void> {
  try {
    const key = `mcpr:auth:failed:${ip}`;
    const raw = await redis.get(key);
    const count = Number(raw ?? '0') + 1;
    await redis.set(key, String(count), 'EX', 60);
  } catch (error) {
    console.warn('Failed auth rate counter update failed:', error);
  }
}

async function readCache(redis: RedisPort, key: string): Promise<AuthContext | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    const parsed = CachedAuthSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Auth cache read failed, falling back to Supabase:', error);
    return null;
  }
}
