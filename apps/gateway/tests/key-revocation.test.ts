import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers/app.js';
import {
  anafPayload,
  createSupabaseMock,
  jsonResponse,
  TEST_API_KEY,
  VALID_CUI,
} from './helpers/fixtures.js';
import { MemoryRedis } from './helpers/memory-redis.js';

describe('Instant API Key Revocation', () => {
  it('rejects unauthenticated calls to POST /api/v1/auth/revoke', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/auth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyHash: 'some-hash' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects calls with an invalid master API key', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/auth/revoke', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-master-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ keyHash: 'some-hash' }),
    });
    expect(res.status).toBe(401);
  });

  it('instantly invalidates a cached key after revocation', async () => {
    const redis = new MemoryRedis();
    const supabase = createSupabaseMock();
    const app = createTestApp({
      redis,
      supabase: supabase.port,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    const userHeaders = { authorization: `Bearer ${TEST_API_KEY}` };

    // 1. First user call succeeds and caches authentication in Redis
    const r1 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers: userHeaders });
    expect(r1.status).toBe(200);

    const keyHash = createHash('sha256').update(TEST_API_KEY).digest('hex');
    const cachedAuth = await redis.get(`mcpr:auth:${keyHash}`);
    expect(cachedAuth).not.toBeNull();

    // 2. Admin calls revocation endpoint with MASTER_API_KEY
    const adminHeaders = {
      authorization: 'Bearer mcpr_live_secret123',
      'content-type': 'application/json',
    };
    const revokeRes = await app.request('/api/v1/auth/revoke', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ keyHash }),
    });
    expect(revokeRes.status).toBe(200);

    // Verify cache was purged and negative cache was established
    const purgedCache = await redis.get(`mcpr:auth:${keyHash}`);
    expect(purgedCache).toBeNull();

    const invalidFlag = await redis.get(`mcpr:auth:invalid:${keyHash}`);
    expect(invalidFlag).toBe('1');

    // 3. User immediately attempts to use the revoked key -> rejected with 401 UNAUTHORIZED!
    const r2 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers: userHeaders });
    expect(r2.status).toBe(401);
    const body = (await r2.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('revokes by apiKeyId and blocks cached tokens immediately', async () => {
    const redis = new MemoryRedis();
    const supabase = createSupabaseMock();
    const app = createTestApp({
      redis,
      supabase: supabase.port,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    const userHeaders = { authorization: `Bearer ${TEST_API_KEY}` };

    // Warm up cache
    const r1 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers: userHeaders });
    expect(r1.status).toBe(200);

    // Revoke by apiKeyId
    const adminHeaders = {
      authorization: 'Bearer mcpr_live_secret123',
      'content-type': 'application/json',
    };
    const revokeRes = await app.request('/api/v1/auth/revoke', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ apiKeyId: '11111111-1111-4111-8111-111111111111' }),
    });
    expect(revokeRes.status).toBe(200);

    // User is blocked with 401
    const r2 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers: userHeaders });
    expect(r2.status).toBe(401);
  });

  it('rejects revoke calls when MASTER_API_KEY is not configured', async () => {
    const app = createTestApp({ env: { MASTER_API_KEY: undefined } });
    const res = await app.request('/api/v1/auth/revoke', {
      method: 'POST',
      headers: {
        authorization: 'Bearer mcpr_live_secret123',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ keyHash: 'some-hash' }),
    });
    expect(res.status).toBe(401);
  });
});
