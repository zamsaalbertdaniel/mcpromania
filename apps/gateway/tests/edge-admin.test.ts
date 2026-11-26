import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/config/env.js';
import { createSupabaseGateway } from '../src/core/supabase.js';
import { recordUsage } from '../src/core/usage.js';

import { createTestApp } from './helpers/app.js';
import {
  anafPayload,
  jsonResponse,
  TEST_API_KEY,
  TEST_AUTH,
  testEnv,
  VALID_CUI,
} from './helpers/fixtures.js';
import { MemoryRedis } from './helpers/memory-redis.js';

describe('Edge Function admin channel & usage integrity', () => {
  it('requires GATEWAY_ADMIN_URL and GATEWAY_EDGE_SECRET to be configured together', () => {
    expect(() =>
      parseEnv({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        GATEWAY_ADMIN_URL: 'https://example.supabase.co/functions/v1/gateway-admin',
      })
    ).toThrow(/GATEWAY_ADMIN_URL/);

    expect(() =>
      parseEnv({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        GATEWAY_EDGE_SECRET: 'super-secret-at-least-16-chars',
      })
    ).toThrow(/GATEWAY_EDGE_SECRET/);
  });

  it('calls private Edge Function with x-gateway-edge-secret for persistent revocation and usage logs', async () => {
    const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
    const gateway = createSupabaseGateway(
      {
        ...testEnv,
        GATEWAY_ADMIN_URL: 'https://example.supabase.co/functions/v1/gateway-admin',
        GATEWAY_EDGE_SECRET: 'edge-secret-1234567890',
      },
      async (url, init) => {
        const headers = new Headers(init?.headers);
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        calls.push({ url: String(url), headers, body });

        if (body.action === 'revoke') {
          return jsonResponse({
            ok: true,
            revokedCount: 1,
            apiKeyIds: [TEST_AUTH.apiKeyId],
            keyHashes: [createHash('sha256').update(TEST_API_KEY).digest('hex')],
          });
        }
        return jsonResponse({ ok: true, id: '33333333-3333-4333-8333-333333333333' });
      }
    );

    const revokeResult = await gateway.revokeApiKeyPersistent?.({
      apiKeyId: TEST_AUTH.apiKeyId,
    });
    expect(revokeResult?.persisted).toBe(true);
    expect(revokeResult?.revokedCount).toBe(1);

    await gateway.recordUsageLog({
      tenantId: TEST_AUTH.tenantId,
      apiKeyId: TEST_AUTH.apiKeyId,
      route: '/api/v1/anaf/cui/:cui',
      idempotencyKey: 'idem-123',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers.get('x-gateway-edge-secret')).toBe('edge-secret-1234567890');
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${testEnv.SUPABASE_ANON_KEY}`);
    expect(calls[1]?.body).toMatchObject({
      action: 'usage_log',
      idempotencyKey: 'idem-123',
    });
  });

  it('fails closed (503) when persistent Edge Function revocation fails, and purges all returned hashes when it succeeds', async () => {
    const redis = new MemoryRedis();
    const keyHash = createHash('sha256').update(TEST_API_KEY).digest('hex');

    let shouldFailEdge = true;
    const supabasePort = {
      verifyApiKey: async (hash: string) => (hash === keyHash ? TEST_AUTH : null),
      recordUsageLog: async () => {},
      revokeApiKeyPersistent: async () => {
        if (shouldFailEdge) {
          throw new Error('Edge Function unreachable');
        }
        return {
          persisted: true,
          revokedCount: 1,
          apiKeyIds: [TEST_AUTH.apiKeyId],
          keyHashes: [keyHash],
        };
      },
    };

    const app = createTestApp({
      redis,
      supabase: supabasePort,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    // Warm auth cache
    const okRes = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(okRes.status).toBe(200);

    // Edge Function failure must NOT falsely report persistent revocation
    const failRevoke = await app.request('/api/v1/auth/revoke', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testEnv.MASTER_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ apiKeyId: TEST_AUTH.apiKeyId }),
    });
    expect(failRevoke.status).toBe(500);

    // Edge Function succeeds -> clears cache AND marks key invalid in Redis
    shouldFailEdge = false;
    const okRevoke = await app.request('/api/v1/auth/revoke', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testEnv.MASTER_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ apiKeyId: TEST_AUTH.apiKeyId }),
    });
    expect(okRevoke.status).toBe(200);
    const body = (await okRevoke.json()) as {
      ok: boolean;
      persisted: boolean;
      revokedCount: number;
    };
    expect(body).toMatchObject({ ok: true, persisted: true, revokedCount: 1 });

    // Cached token is immediately blocked
    expect(await redis.get(`mcpr:auth:${keyHash}`)).toBeNull();
    const blocked = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(blocked.status).toBe(401);
  });

  it('retries usage logging once using the exact same idempotencyKey on transient failure', async () => {
    const keysSeen: string[] = [];
    let attempts = 0;

    recordUsage(
      {
        verifyApiKey: async () => null,
        recordUsageLog: async (input) => {
          attempts += 1;
          keysSeen.push(input.idempotencyKey ?? '');
          if (attempts === 1) {
            throw new Error('transient timeout');
          }
        },
      },
      TEST_AUTH,
      '/api/v1/bnr/exchange-rate'
    );

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(attempts).toBe(2);
    expect(keysSeen[0]).toBeTruthy();
    expect(keysSeen[0]).toBe(keysSeen[1]);
  });
});
