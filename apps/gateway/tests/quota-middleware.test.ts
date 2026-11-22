import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers/app.js';
import {
  anafPayload,
  createSupabaseMock,
  jsonResponse,
  TEST_API_KEY,
  VALID_CUI,
} from './helpers/fixtures.js';

describe('Monthly Quota Middleware', () => {
  it('returns X-Quota headers on successful REST requests', async () => {
    const supabase = createSupabaseMock();
    const app = createTestApp({
      supabase: supabase.port,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    const res = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('x-quota-limit')).toBe('5000');
    expect(res.headers.get('x-quota-used')).toBe('1');
    expect(res.headers.get('x-quota-remaining')).toBe('4999');
    expect(res.headers.get('x-quota-reset')).toBeDefined();
  });

  it('rejects with 429 MONTHLY_QUOTA_EXCEEDED when monthly limit is exhausted', async () => {
    const customAuth = {
      apiKeyId: '99999999-9999-4999-8999-999999999999',
      tenantId: '88888888-8888-4888-8888-888888888888',
      keyName: 'free-user',
      planTier: 'free' as const,
      monthlyLimit: 3, // Low quota for fast testing
    };

    const supabase = {
      verifyApiKey: async () => customAuth,
      recordUsageLog: async () => {},
    };

    const app = createTestApp({
      supabase,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    const headers = { authorization: `Bearer ${TEST_API_KEY}` };

    // Request 1: OK
    const r1 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    expect(r1.status).toBe(200);
    expect(r1.headers.get('x-quota-remaining')).toBe('2');

    // Request 2: OK
    const r2 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    expect(r2.status).toBe(200);
    expect(r2.headers.get('x-quota-remaining')).toBe('1');

    // Request 3: OK (limit reached)
    const r3 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    expect(r3.status).toBe(200);
    expect(r3.headers.get('x-quota-remaining')).toBe('0');

    // Request 4: Blocked with HTTP 429 MONTHLY_QUOTA_EXCEEDED
    const r4 = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, { headers });
    expect(r4.status).toBe(429);
    expect(r4.headers.get('x-quota-remaining')).toBe('0');
    expect(r4.headers.get('x-quota-used')).toBe('3');

    const body = (await r4.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('MONTHLY_QUOTA_EXCEEDED');
    expect(body.error.message).toContain('Ați atins limita lunară de 3 cereri pentru planul FREE');
  });
});
