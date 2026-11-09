import { describe, expect, it } from 'vitest';

import { createTestApp } from './helpers/app.js';
import {
  anafPayload,
  createSupabaseMock,
  jsonResponse,
  TEST_API_KEY,
  VALID_CUI,
} from './helpers/fixtures.js';

describe('rate limiter', () => {
  it('allows 60 requests per minute and rejects the 61st with 429', async () => {
    const supabase = createSupabaseMock();
    const app = createTestApp({
      supabase: supabase.port,
      fetchImpl: async () => jsonResponse(anafPayload()),
    });

    let lastRemaining = 60;
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      const response = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
        headers: { authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(response.status).toBe(200);
      lastRemaining = Number(response.headers.get('x-ratelimit-remaining'));
      expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    }
    expect(lastRemaining).toBe(0);

    const blocked = await app.request(`/api/v1/anaf/cui/${VALID_CUI}`, {
      headers: { authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('x-ratelimit-remaining')).toBe('0');
    const body = (await blocked.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});
